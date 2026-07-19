import type { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; telegramId: string; role: UserRole };
    }
  }
}

export {};
