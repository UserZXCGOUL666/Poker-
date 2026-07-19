import { Router } from 'express';
import { TournamentStatus } from '@prisma/client';
import { z } from 'zod';
import { notifyAboutTournament } from '../bot.js';
import { env } from '../config.js';
import { prisma } from '../db.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { browserInviteExpiresAt, createBrowserInviteToken, hashBrowserInviteToken } from '../services/browserAccess.js';
import { applyManualPointChange } from '../services/points.js';
import { shouldResetSeasonBalances } from '../services/seasons.js';
import { participantsFitCapacity } from '../services/tournaments.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/overview', async (_req, res) => {
  const now = new Date();
  const [players, tournaments, activeSeason, activeBrowserSessions, nextTournament, recentTournaments, recentPointTransactions] = await Promise.all([
    prisma.user.count(),
    prisma.tournament.count(),
    prisma.season.findFirst({ where: { isActive: true } }),
    prisma.browserSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
    prisma.tournament.findFirst({ where: { status: 'UPCOMING', startsAt: { gte: now } }, orderBy: { startsAt: 'asc' } }),
    prisma.tournament.findMany({
      orderBy: { startsAt: 'desc' }, take: 6,
      include: { season: { select: { name: true } }, _count: { select: { results: true, notifications: true } } }
    }),
    prisma.pointTransaction.findMany({
      orderBy: { createdAt: 'desc' }, take: 6,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, username: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } }
      }
    })
  ]);
  return res.json({ players, tournaments, activeSeason, activeBrowserSessions, nextTournament, recentTournaments, recentPointTransactions });
});

adminRouter.get('/users', async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const users = await prisma.user.findMany({
    where: search ? {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } }
      ]
    } : undefined,
    orderBy: [{ points: 'desc' }, { firstName: 'asc' }],
    take: 1000,
    select: {
      id: true, telegramId: true, firstName: true, lastName: true, username: true, role: true, points: true,
      _count: { select: { results: true, browserSessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } }
    }
  });
  return res.json(users.map((user) => ({ ...user, telegramId: user.telegramId.toString() })));
});

adminRouter.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      pointTransactions: {
        orderBy: { createdAt: 'desc' }, take: 50,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          season: { select: { id: true, name: true } }
        }
      },
      results: {
        orderBy: { createdAt: 'desc' }, take: 20,
        include: { tournament: { select: { id: true, title: true, startsAt: true, status: true } } }
      },
      browserSessions: { orderBy: { createdAt: 'desc' }, take: 30 }
    }
  });
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  return res.json({ ...user, telegramId: user.telegramId.toString() });
});

const browserInviteSchema = z.object({ userId: z.string().min(1) });

adminRouter.post('/browser-access/invites', async (req, res, next) => {
  try {
    const { userId } = browserInviteSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, telegramId: true, firstName: true, lastName: true, username: true }
    });
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    const token = createBrowserInviteToken();
    const expiresAt = browserInviteExpiresAt();
    await prisma.$transaction(async (tx) => {
      await tx.browserAccessInvite.deleteMany({ where: { userId, usedAt: null } });
      await tx.browserAccessInvite.create({
        data: {
          tokenHash: hashBrowserInviteToken(token),
          userId,
          createdById: req.auth!.userId,
          expiresAt
        }
      });
    });

    const url = new URL('/browser-login', env.MINI_APP_URL);
    url.searchParams.set('token', token);
    return res.status(201).json({
      url: url.toString(),
      expiresAt,
      user: { ...user, telegramId: user.telegramId.toString() }
    });
  } catch (error) { return next(error); }
});

adminRouter.get('/browser-access/sessions', async (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  const sessions = await prisma.browserSession.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { id: true, telegramId: true, firstName: true, lastName: true, username: true } }
    }
  });
  return res.json(sessions.map((session) => ({
    ...session,
    user: { ...session.user, telegramId: session.user.telegramId.toString() }
  })));
});

adminRouter.post('/browser-access/sessions/:id/revoke', async (req, res) => {
  const revoked = await prisma.browserSession.updateMany({
    where: { id: req.params.id, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  if (revoked.count !== 1) return res.status(404).json({ message: 'Активная браузерная сессия не найдена' });
  return res.json({ message: 'Браузерный доступ отозван' });
});

const pointChangeSchema = z.object({
  userId: z.string().min(1),
  amount: z.coerce.number().int().min(-100000).max(100000).refine((value) => value !== 0, 'Укажите ненулевое количество очков'),
  reason: z.string().trim().min(3).max(160),
  idempotencyKey: z.string().uuid().optional()
});

adminRouter.post('/points', async (req, res, next) => {
  try {
    const data = pointChangeSchema.parse(req.body);
    const result = await applyManualPointChange({ ...data, adminId: req.auth!.userId });
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { return next(error); }
});

adminRouter.get('/points/history', async (req, res, next) => {
  try {
    const query = z.object({
      userId: z.string().optional(),
      take: z.coerce.number().int().min(1).max(100).default(30)
    }).parse(req.query);
    const history = await prisma.pointTransaction.findMany({
      where: query.userId ? { userId: query.userId } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.take,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, username: true, points: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        season: { select: { id: true, name: true } }
      }
    });
    return res.json(history);
  } catch (error) { return next(error); }
});

adminRouter.get('/seasons', async (_req, res) => {
  const seasons = await prisma.season.findMany({ orderBy: { startsAt: 'desc' }, include: { _count: { select: { tournaments: true } } } });
  return res.json(seasons);
});

const seasonBaseSchema = z.object({
  name: z.string().min(2).max(80),
  number: z.coerce.number().int().positive(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  isActive: z.boolean().default(false)
});
const seasonSchema = seasonBaseSchema.refine((data) => data.endsAt > data.startsAt, { message: 'Дата окончания должна быть позже начала' });

adminRouter.post('/seasons', async (req, res, next) => {
  try {
    const data = seasonSchema.parse(req.body);
    const season = await prisma.$transaction(async (tx) => {
      if (data.isActive) {
        await tx.season.updateMany({ data: { isActive: false } });
        await tx.user.updateMany({ data: { points: 0 } });
      }
      return tx.season.create({ data });
    });
    return res.status(201).json(season);
  } catch (error) { return next(error); }
});

adminRouter.patch('/seasons/:id', async (req, res, next) => {
  try {
    const patch = seasonBaseSchema.partial().parse(req.body);
    const existing = await prisma.season.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Сезон не найден' });
    const data = seasonSchema.parse({ ...existing, ...patch });
    const shouldResetBalances = shouldResetSeasonBalances(existing.isActive, data.isActive);
    const season = await prisma.$transaction(async (tx) => {
      if (shouldResetBalances) {
        await tx.season.updateMany({ where: { id: { not: existing.id } }, data: { isActive: false } });
        await tx.user.updateMany({ data: { points: 0 } });
      }
      return tx.season.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          number: data.number,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          isActive: data.isActive
        }
      });
    });
    return res.json({ ...season, balancesReset: shouldResetBalances });
  } catch (error) { return next(error); }
});

const tournamentBaseSchema = z.object({
  seasonId: z.string().min(1),
  title: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  startsAt: z.coerce.date(),
  location: z.string().max(120).optional().nullable(),
  capacity: z.coerce.number().int().min(2).max(1000).default(48),
  participantCount: z.coerce.number().int().min(0).max(1000).default(0),
  status: z.nativeEnum(TournamentStatus).default(TournamentStatus.UPCOMING)
});
const tournamentSchema = tournamentBaseSchema.refine((data) => participantsFitCapacity(data.participantCount, data.capacity), {
  message: 'Количество участников не может превышать вместимость',
  path: ['participantCount']
});

adminRouter.get('/tournaments/:id', async (req, res) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
    include: {
      season: true,
      results: { orderBy: { place: 'asc' }, include: { user: { select: { id: true, firstName: true, lastName: true, username: true } } } }
    }
  });
  if (!tournament) return res.status(404).json({ message: 'Турнир не найден' });
  return res.json(tournament);
});

adminRouter.post('/tournaments', async (req, res, next) => {
  try {
    const data = tournamentSchema.parse(req.body);
    return res.status(201).json(await prisma.tournament.create({ data }));
  } catch (error) { return next(error); }
});

adminRouter.patch('/tournaments/:id', async (req, res, next) => {
  try {
    const patch = tournamentBaseSchema.partial().parse(req.body);
    const existing = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Турнир не найден' });
    const data = tournamentSchema.parse({ ...existing, ...patch });
    return res.json(await prisma.tournament.update({ where: { id: existing.id }, data }));
  } catch (error) { return next(error); }
});

adminRouter.delete('/tournaments/:id', async (req, res, next) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { results: true } } }
    });
    if (!tournament) return res.status(404).json({ message: 'Турнир не найден' });
    if (tournament._count.results > 0) {
      return res.status(409).json({ message: 'Турнир с результатами нельзя удалить. Измените его статус на «Отменён».' });
    }
    await prisma.tournament.delete({ where: { id: tournament.id } });
    return res.json({ message: 'Турнир удалён' });
  } catch (error) { return next(error); }
});

const resultSchema = z.object({
  results: z.array(z.object({ userId: z.string().min(1), place: z.coerce.number().int().positive() })).min(2).max(1000)
}).superRefine(({ results }, ctx) => {
  const users = new Set(results.map((item) => item.userId));
  const places = new Set(results.map((item) => item.place));
  if (users.size !== results.length) ctx.addIssue({ code: 'custom', message: 'Игрок не может встречаться дважды' });
  if (places.size !== results.length) ctx.addIssue({ code: 'custom', message: 'Места не должны повторяться' });
  const sorted = [...places].sort((a, b) => a - b);
  if (sorted.some((place, index) => place !== index + 1)) ctx.addIssue({ code: 'custom', message: 'Места должны идти подряд, начиная с 1' });
});

adminRouter.put('/tournaments/:id/results', async (req, res, next) => {
  try {
    const { results } = resultSchema.parse(req.body);
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return res.status(404).json({ message: 'Турнир не найден' });
    const users = await prisma.user.count({ where: { id: { in: results.map((item) => item.userId) } } });
    if (users !== results.length) return res.status(400).json({ message: 'Один или несколько игроков не найдены' });

    await prisma.$transaction(async (tx) => {
      await tx.tournamentResult.deleteMany({ where: { tournamentId: tournament.id } });
      await tx.tournamentResult.createMany({
        data: results.map((item) => ({
          tournamentId: tournament.id,
          userId: item.userId,
          place: item.place,
          points: 0,
          isFinalTable: item.place <= Math.min(8, results.length)
        }))
      });
      await tx.tournament.update({
        where: { id: tournament.id },
        data: { status: TournamentStatus.FINISHED, participantCount: results.length }
      });
    });
    return res.json({ message: 'Места сохранены. Очки начисляются отдельно вручную.' });
  } catch (error) { return next(error); }
});

adminRouter.post('/tournaments/:id/notify', async (req, res, next) => {
  try {
    return res.json(await notifyAboutTournament(req.params.id));
  } catch (error) { return next(error); }
});
