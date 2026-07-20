import { Router } from 'express';
import { TournamentRegistrationStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { cancelTournamentRegistration, registerForTournament } from '../services/registrations.js';
import { notifyUser, registrationNotification } from '../bot.js';

export const publicRouter = Router();

publicRouter.get('/branding/rating-banner', async (_req, res) => {
  const settings = await prisma.clubSettings.findUnique({ where: { id: 'main' }, select: { ratingBannerImageData: true, updatedAt: true } });
  const match = settings?.ratingBannerImageData?.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return res.status(404).end();
  const image = Buffer.from(match[2], 'base64');
  res.setHeader('Content-Type', match[1]);
  res.setHeader('Content-Length', image.length);
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  if (settings) res.setHeader('Last-Modified', settings.updatedAt.toUTCString());
  return res.send(image);
});

publicRouter.use(requireAuth);

const userSelect = { id: true, firstName: true, lastName: true, username: true, photoUrl: true, points: true } as const;

publicRouter.get('/home', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: userSelect });
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [season, nextTournament, leaders, usersAhead, totalUsers, weeklyResult, finalTables, gamesPlayed, branding, nextSeating] = await Promise.all([
    prisma.season.findFirst({ where: { isActive: true }, orderBy: { startsAt: 'desc' } }),
    prisma.tournament.findFirst({ where: { status: 'UPCOMING', startsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' } }),
    prisma.user.findMany({ orderBy: [{ points: 'desc' }, { createdAt: 'asc' }], take: 3, select: userSelect }),
    prisma.user.count({ where: { points: { gt: user.points } } }),
    prisma.user.count(),
    prisma.pointTransaction.aggregate({ where: { userId: user.id, season: { isActive: true }, createdAt: { gte: weekAgo } }, _sum: { amount: true } }),
    prisma.tournamentResult.count({ where: { userId: user.id, isFinalTable: true, tournament: { season: { isActive: true } } } }),
    prisma.tournamentResult.count({ where: { userId: user.id, tournament: { season: { isActive: true } } } }),
    prisma.clubSettings.findUnique({ where: { id: 'main' }, select: { ratingBannerImageData: true, updatedAt: true } }),
    prisma.tournamentSeat.findFirst({
      where: { userId: user.id, tournament: { seatingPublishedAt: { not: null }, status: { in: ['UPCOMING', 'ACTIVE'] }, startsAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) } } },
      orderBy: { tournament: { startsAt: 'asc' } },
      select: { seatNumber: true, table: { select: { number: true } }, tournament: { select: { id: true, title: true, startsAt: true } } }
    })
  ]);
  return res.json({
    season,
    week: season ? Math.max(1, Math.ceil((Date.now() - season.startsAt.getTime()) / (7 * 24 * 60 * 60 * 1000))) : 1,
    user: { ...user, rank: usersAhead + 1, totalUsers },
    nextTournament,
    weeklyPoints: weeklyResult._sum.amount ?? 0,
    finalTables,
    gamesPlayed,
    leaders,
    branding: { hasRatingBanner: Boolean(branding?.ratingBannerImageData), updatedAt: branding?.updatedAt ?? null },
    nextSeating
  });
});

publicRouter.get('/tournaments', async (req, res) => {
  const tournaments = await prisma.tournament.findMany({
    include: {
      season: { select: { name: true } },
      registrations: { where: { userId: req.auth!.userId }, take: 1 },
      _count: { select: { results: true, registrations: { where: { status: { in: [TournamentRegistrationStatus.REGISTERED, TournamentRegistrationStatus.CHECKED_IN, TournamentRegistrationStatus.PLAYED] } } } } }
    },
    orderBy: { startsAt: 'desc' }
  });
  const waitlisted = await prisma.tournamentRegistration.findMany({
    where: { tournamentId: { in: tournaments.map((item) => item.id) }, status: TournamentRegistrationStatus.WAITLISTED },
    orderBy: [{ tournamentId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, tournamentId: true, userId: true }
  });
  const waitlistPosition = new Map<string, number>();
  const counters = new Map<string, number>();
  for (const entry of waitlisted) {
    const position = (counters.get(entry.tournamentId) ?? 0) + 1;
    counters.set(entry.tournamentId, position);
    if (entry.userId === req.auth!.userId) waitlistPosition.set(entry.id, position);
  }
  return res.json(tournaments.map(({ registrations, ...tournament }) => ({
    ...tournament,
    participantCount: tournament._count.registrations,
    registration: registrations[0] ? { ...registrations[0], waitlistPosition: waitlistPosition.get(registrations[0].id) ?? null } : null
  })));
});

publicRouter.post('/tournaments/:id/registration', async (req, res, next) => {
  try {
    const result = await registerForTournament(req.params.id, req.auth!.userId, { actorId: req.auth!.userId, actorIsAdmin: false });
    const notification = result.duplicate ? null : await notifyUser(result.user.telegramId, registrationNotification(result.tournament.title, result.tournament.startsAt, result.registration.status === TournamentRegistrationStatus.WAITLISTED ? 'WAITLISTED' : 'REGISTERED'));
    return res.status(result.duplicate ? 200 : 201).json({ registration: result.registration, notification });
  } catch (error) { return next(error); }
});

publicRouter.delete('/tournaments/:id/registration', async (req, res, next) => {
  try {
    const registration = await prisma.tournamentRegistration.findUnique({ where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.auth!.userId } } });
    if (!registration) return res.status(404).json({ message: 'Вы не записаны на этот турнир' });
    const result = await cancelTournamentRegistration(registration.id, { actorId: req.auth!.userId, actorIsAdmin: false, requestedByUserId: req.auth!.userId });
    const notification = result.duplicate ? null : await notifyUser(result.user.telegramId, registrationNotification(result.tournament.title, result.tournament.startsAt, 'CANCELLED'));
    const promotionNotification = result.promoted
      ? await notifyUser(result.promoted.user.telegramId, registrationNotification(result.tournament.title, result.tournament.startsAt, 'PROMOTED'))
      : null;
    return res.json({ registration: result.registration, notification, promotionNotification });
  } catch (error) { return next(error); }
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
      phoneNumber: true,
      phoneSharedAt: true,
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
  return res.json({
    ...user,
    telegramId: user.telegramId.toString(),
    phoneNumber: undefined,
    hasPhoneNumber: Boolean(user.phoneNumber),
    phoneNumberMasked: user.phoneNumber ? `${user.phoneNumber.slice(0, 4)}••••${user.phoneNumber.slice(-2)}` : null,
    rank: rank + 1
  });
});
