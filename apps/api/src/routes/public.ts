import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const publicRouter = Router();
publicRouter.use(requireAuth);

const userSelect = { id: true, firstName: true, lastName: true, username: true, photoUrl: true, points: true } as const;

publicRouter.get('/home', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: userSelect });
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [season, nextTournament, leaders, usersAhead, totalUsers, weeklyResult, finalTables, gamesPlayed] = await Promise.all([
    prisma.season.findFirst({ where: { isActive: true }, orderBy: { startsAt: 'desc' } }),
    prisma.tournament.findFirst({ where: { status: 'UPCOMING', startsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' } }),
    prisma.user.findMany({ orderBy: [{ points: 'desc' }, { createdAt: 'asc' }], take: 3, select: userSelect }),
    prisma.user.count({ where: { points: { gt: user.points } } }),
    prisma.user.count(),
    prisma.pointTransaction.aggregate({ where: { userId: user.id, season: { isActive: true }, createdAt: { gte: weekAgo } }, _sum: { amount: true } }),
    prisma.tournamentResult.count({ where: { userId: user.id, isFinalTable: true, tournament: { season: { isActive: true } } } }),
    prisma.tournamentResult.count({ where: { userId: user.id, tournament: { season: { isActive: true } } } })
  ]);
  return res.json({
    season,
    week: season ? Math.max(1, Math.ceil((Date.now() - season.startsAt.getTime()) / (7 * 24 * 60 * 60 * 1000))) : 1,
    user: { ...user, rank: usersAhead + 1, totalUsers },
    nextTournament,
    weeklyPoints: weeklyResult._sum.amount ?? 0,
    finalTables,
    gamesPlayed,
    leaders
  });
});

publicRouter.get('/tournaments', async (_req, res) => {
  const tournaments = await prisma.tournament.findMany({
    include: { season: { select: { name: true } }, _count: { select: { results: true } } },
    orderBy: { startsAt: 'desc' }
  });
  return res.json(tournaments);
});

publicRouter.get('/leaderboard', async (req, res) => {
  const period = req.query.period === 'week' ? 'week' : 'season';
  if (period === 'season') {
    const users = await prisma.user.findMany({ orderBy: [{ points: 'desc' }, { createdAt: 'asc' }], select: userSelect });
    return res.json(users.map((user, index) => ({ ...user, rank: index + 1 })));
  }
  const sums = await prisma.pointTransaction.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, season: { isActive: true } },
    _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } }
  });
  const users = await prisma.user.findMany({ where: { id: { in: sums.map((item) => item.userId) } }, select: userSelect });
  const map = new Map(users.map((user) => [user.id, user]));
  return res.json(sums.map((item, index) => ({ ...map.get(item.userId), points: item._sum.amount ?? 0, rank: index + 1 })));
});

publicRouter.get('/profile', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: {
      ...userSelect,
      telegramId: true,
      role: true,
      createdAt: true,
      results: { include: { tournament: true }, orderBy: { createdAt: 'desc' }, take: 10 },
      pointTransactions: {
        where: { season: { isActive: true } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          season: { select: { id: true, name: true } }
        }
      }
    }
  });
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  const rank = await prisma.user.count({ where: { points: { gt: user.points } } });
  return res.json({ ...user, telegramId: user.telegramId.toString(), rank: rank + 1 });
});
