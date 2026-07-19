import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { adminTelegramIds, env } from '../config.js';
import { prisma } from '../db.js';
import { createAccessToken, requireAuth } from '../middleware/auth.js';
import { validateTelegramInitData, type TelegramUserData } from '../services/telegramAuth.js';

export const authRouter = Router();

const bodySchema = z.object({
  initData: z.string().optional(),
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

    const token = createAccessToken({ sub: user.id, telegramId, role: user.role });
    return res.json({ token, user: serializeUser(user) });
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

function serializeUser(user: { id: string; telegramId: bigint; username: string | null; firstName: string; lastName: string | null; photoUrl: string | null; role: UserRole; points: number }) {
  return { ...user, telegramId: user.telegramId.toString() };
}
