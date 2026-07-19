export type Role = 'PLAYER' | 'ADMIN';
export type TournamentStatus = 'UPCOMING' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';

export type User = {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  role: Role;
  points: number;
};

export type Player = Pick<User, 'id' | 'firstName' | 'lastName' | 'username' | 'photoUrl' | 'points'> & { rank?: number };

export type Season = {
  id: string;
  name: string;
  number: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  _count?: { tournaments: number };
};

export type Tournament = {
  id: string;
  seasonId: string;
  title: string;
  description: string | null;
  startsAt: string;
  location: string | null;
  capacity: number;
  participantCount: number;
  status: TournamentStatus;
  season?: { name: string };
  _count?: { results: number; notifications?: number };
};

export type PointTransaction = {
  id: string;
  userId: string;
  seasonId: string;
  createdById: string;
  type: 'AWARD' | 'DEDUCTION' | 'CORRECTION';
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName' | 'username' | 'points'>;
  createdBy: Pick<User, 'id' | 'firstName' | 'lastName'>;
  season: Pick<Season, 'id' | 'name'>;
};

export type HomeData = {
  season: Season | null;
  week: number;
  user: Player & { rank: number; totalUsers: number };
  nextTournament: Tournament | null;
  weeklyPoints: number;
  finalTables: number;
  gamesPlayed: number;
  leaders: Player[];
};
