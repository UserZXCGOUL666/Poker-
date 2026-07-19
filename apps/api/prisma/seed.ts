import { PointTransactionType, PrismaClient, TournamentStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const players = [
  [111111111n, 'Алексей', 'Ковалёв', 'AK', UserRole.ADMIN],
  [222222222n, 'Максим', 'Орлов', 'MaxPoker', UserRole.PLAYER],
  [333333333n, 'Роман', 'Фролов', 'RiverFox', UserRole.PLAYER],
  [444444444n, 'Александр', 'Смирнов', 'AlexStorm', UserRole.PLAYER],
  [555555555n, 'Мария', 'Волкова', 'MaryAce', UserRole.PLAYER],
  [666666666n, 'Денис', 'Левин', 'DL', UserRole.PLAYER],
  [777777777n, 'Илья', 'Петров', 'IP', UserRole.PLAYER],
  [888888888n, 'Анна', 'Мирова', 'AM', UserRole.PLAYER]
] as const;

async function main() {
  await prisma.pointTransaction.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.tournamentResult.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.season.deleteMany();
  await prisma.user.deleteMany();

  const users = [];
  for (const [telegramId, firstName, lastName, username, role] of players) {
    users.push(await prisma.user.create({
      data: { telegramId, firstName, lastName, username, role }
    }));
  }

  const now = new Date();
  const seasonStart = new Date(now);
  seasonStart.setDate(seasonStart.getDate() - 42);
  const seasonEnd = new Date(now);
  seasonEnd.setDate(seasonEnd.getDate() + 42);

  const season = await prisma.season.create({
    data: { name: 'Сезон 04', number: 4, startsAt: seasonStart, endsAt: seasonEnd, isActive: true }
  });
  const balances = new Map(users.map((user) => [user.id, 0]));
  const demoAwards = [600, 480, 400, 340, 300, 260, 230, 210];

  for (let week = 1; week <= 6; week += 1) {
    const startsAt = new Date(seasonStart);
    startsAt.setDate(startsAt.getDate() + week * 7);
    startsAt.setHours(20, 0, 0, 0);
    const tournament = await prisma.tournament.create({
      data: {
        seasonId: season.id,
        title: week % 2 ? 'Пятничный турнир' : 'Клубный вечер',
        description: 'Еженедельный спортивный турнир клуба',
        startsAt,
        location: 'Poker Club',
        capacity: 48,
        participantCount: users.length,
        status: TournamentStatus.FINISHED
      }
    });

    const rotated = [...users].sort((a, b) => {
      const av = (Number(a.telegramId % 97n) + week * 11) % 53;
      const bv = (Number(b.telegramId % 97n) + week * 11) % 53;
      return av - bv;
    });
    await prisma.tournamentResult.createMany({
      data: rotated.map((user, index) => ({
        tournamentId: tournament.id,
        userId: user.id,
        place: index + 1,
        points: 0,
        isFinalTable: index < 8
      }))
    });

    const awardedAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
    for (const [index, user] of rotated.entries()) {
      const amount = demoAwards[index] ?? 50;
      const balanceAfter = (balances.get(user.id) ?? 0) + amount;
      balances.set(user.id, balanceAfter);
      await prisma.pointTransaction.create({
        data: {
          userId: user.id,
          seasonId: season.id,
          createdById: users[0].id,
          type: PointTransactionType.AWARD,
          amount,
          balanceAfter,
          reason: `${tournament.title}: ${index + 1} место`,
          createdAt: awardedAt
        }
      });
    }
  }

  const nextFriday = new Date(now);
  nextFriday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7 || 7));
  nextFriday.setHours(20, 0, 0, 0);
  await prisma.tournament.create({
    data: {
      seasonId: season.id,
      title: 'Пятничный турнир',
      description: 'Главная игра недели. Результаты входят в рейтинг сезона.',
      startsAt: nextFriday,
      location: 'Poker Club',
      capacity: 48,
      participantCount: 38,
      status: TournamentStatus.UPCOMING
    }
  });

  for (const [userId, total] of balances) {
    await prisma.user.update({ where: { id: userId }, data: { points: total } });
  }
}

main()
  .then(() => console.log('Демо-данные Poker Club созданы'))
  .finally(async () => prisma.$disconnect());
