import { Router } from 'express';
import { TournamentStatus } from '@prisma/client';
import { z } from 'zod';
import { notifyAboutTournament } from '../bot.js';
import { prisma } from '../db.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { applyManualPointChange } from '../services/points.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/overview', async (_req, res) => {
  const [players, tournaments, activeSeason, recentTournaments] = await Promise.all([
    prisma.user.count(),
    prisma.tournament.count(),
    prisma.season.findFirst({ where: { isActive: true } }),
    prisma.tournament.findMany({
      orderBy: { startsAt: 'desc' }, take: 6,
      include: { season: { select: { name: true } }, _count: { select: { results: true, notifications: true } } }
    })
  ]);
  return res.json({ players, tournaments, activeSeason, recentTournaments });
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
    select: { id: true, telegramId: true, firstName: true, lastName: true, username: true, role: true, points: true }
  });
  return res.json(users.map((user) => ({ ...user, telegramId: user.telegramId.toString() })));
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

const seasonSchema = z.object({
  name: z.string().min(2).max(80),
  number: z.coerce.number().int().positive(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  isActive: z.boolean().default(false)
}).refine((data) => data.endsAt > data.startsAt, { message: 'Дата окончания должна быть позже начала' });

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

const tournamentSchema = z.object({
  seasonId: z.string().min(1),
  title: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  startsAt: z.coerce.date(),
  location: z.string().max(120).optional().nullable(),
  capacity: z.coerce.number().int().min(2).max(1000).default(48),
  participantCount: z.coerce.number().int().min(0).max(1000).default(0),
  status: z.nativeEnum(TournamentStatus).default(TournamentStatus.UPCOMING)
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
    const data = tournamentSchema.partial().parse(req.body);
    return res.json(await prisma.tournament.update({ where: { id: req.params.id }, data }));
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
