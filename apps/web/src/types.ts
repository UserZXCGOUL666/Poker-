export type Role = 'PLAYER' | 'ADMIN';
export type TournamentStatus = 'UPCOMING' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
export type TournamentRegistrationStatus = 'REGISTERED' | 'WAITLISTED' | 'CHECKED_IN' | 'PLAYED' | 'CANCELLED';

export type PlayerTag = { id: string; name: string; color: string };

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
  finalizedAt?: string | null;
  finalizedById?: string | null;
  standings?: { rank: number; points: number; user: Pick<User, 'id' | 'firstName' | 'lastName' | 'username'> }[];
  _count?: { tournaments: number; standings?: number };
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
  registrationClosed: boolean;
  registrationDeadline: string | null;
  registration?: { id: string; status: TournamentRegistrationStatus; waitlistPosition: number | null } | null;
  season?: { name: string };
  _count?: { results: number; notifications?: number; registrations?: number };
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
  season: Pick<Season, 'id' | 'name' | 'isActive' | 'finalizedAt'>;
  reversalOfId?: string | null;
  reversedBy?: { id: string; createdAt: string } | null;
  reversalOf?: { id: string; amount: number; reason: string } | null;
  batch?: { id: string; tournament: { id: string; title: string } | null } | null;
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
  branding?: { hasRatingBanner: boolean; updatedAt: string | null };
  nextSeating: { seatNumber: number; table: { number: number }; tournament: { id: string; title: string; startsAt: string } } | null;
};
