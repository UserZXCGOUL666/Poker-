import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { adminTelegramIds, env } from '../config.js';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { createAccessToken, requireAuth } from '../middleware/auth.js';
import { browserSessionExpiresAt, hashBrowserInviteToken } from '../services/browserAccess.js';
import { validateTelegramInitData, type TelegramUserData } from '../services/telegramAuth.js';
import { createReferralForNewUser, ensureReferralCode, recordDailyAppOpen } from '../services/loyalty.js';

export const authRouter = Router();

const bodySchema = z.object({
  initData: z.string().optional(),
  referralCode: z.string().trim().max(32).optional(),
  devUser: z.object({
    id: z.coerce.number().int().positive(),
    first_name: z.string().default('Алексей'),
    last_name: z.string().optional(),
    username: z.string().optional()
  }).optional()
});

authRouter.post('/telegram', async (req, res, next) => {
  try {
    const body = bodySchema.parse(req.body);
    let telegramUser: TelegramUserData;

    if (body.initData && env.TELEGRAM_BOT_TOKEN) {
      telegramUser = validateTelegramInitData(body.initData, env.TELEGRAM_BOT_TOKEN);
    } else if (env.NODE_ENV !== 'production' && env.ALLOW_DEV_AUTH && body.devUser) {
      telegramUser = body.devUser;
    } else {
      return res.status(401).json({ message: 'Откройте приложение через Telegram' });
    }

    const telegramId = String(telegramUser.id);
    const existingUser = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { id: true } });
    const role = adminTelegramIds.has(telegramId) ? UserRole.ADMIN : UserRole.PLAYER;
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(telegramId) },
      update: {
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        username: telegramUser.username,
        photoUrl: telegramUser.photo_url,
        role
      },
      create: {
        telegramId: BigInt(telegramId),
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        username: telegramUser.username,
        photoUrl: telegramUser.photo_url,
        role
      }
    });

    await ensureReferralCode(user.id);
    if (!existingUser) await createReferralForNewUser(user.id, body.referralCode);
    await recordDailyAppOpen(user.id).catch((error) => console.error('Не удалось записать открытие приложения', error));

    const token = createAccessToken({ sub: user.id, telegramId, role: user.role, authMethod: 'telegram' });
    return res.json({ token, user: serializeUser(user) });
  } catch (error) {
    return next(error);
  }
});

const browserExchangeSchema = z.object({ token: z.string().min(40).max(256) });

authRouter.post('/browser/exchange', async (req, res, next) => {
  try {
    const { token } = browserExchangeSchema.parse(req.body);
    const now = new Date();
    const tokenHash = hashBrowserInviteToken(token);
    const result = await prisma.$transaction(async (tx) => {
      const invite = await tx.browserAccessInvite.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        include: { user: true }
      });
      if (!invite) throw new AppError('Ссылка недействительна, уже использована или истекла', 401, 'INVALID_BROWSER_INVITE');

      const claimed = await tx.browserAccessInvite.updateMany({
        where: { id: invite.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now }
      });
      if (claimed.count !== 1) throw new AppError('Ссылка уже использована', 401, 'USED_BROWSER_INVITE');

      const session = await tx.browserSession.create({
        data: { userId: invite.userId, expiresAt: browserSessionExpiresAt(now) }
      });
      return { user: invite.user, session };
    });

    const telegramId = result.user.telegramId.toString();
    const role = adminTelegramIds.has(telegramId) ? UserRole.ADMIN : UserRole.PLAYER;
    const user = result.user.role === role
      ? result.user
      : await prisma.user.update({ where: { id: result.user.id }, data: { role } });
    const accessToken = createAccessToken({
      sub: user.id,
      telegramId,
      role: user.role,
      authMethod: 'browser',
      sessionId: result.session.id
    }, '30d');
    return res.json({ token: accessToken, user: serializeUser(user), expiresAt: result.session.expiresAt });
  } catch (error) {
    return next(error);
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  let user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  const expectedRole = adminTelegramIds.has(user.telegramId.toString()) ? UserRole.ADMIN : UserRole.PLAYER;
  if (user.role !== expectedRole) {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: expectedRole } });
  }
  return res.json(serializeUser(user));
});

function serializeUser(user: { id: string; telegramId: bigint; username: string | null; firstName: string; lastName: string | null; photoUrl: string | null; role: UserRole; points: number; clubXp: number }) {
  return { ...user, telegramId: user.telegramId.toString() };
}
