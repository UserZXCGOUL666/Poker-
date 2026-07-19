import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { adminTelegramIds, env } from '../config.js';

type TokenPayload = { sub: string; telegramId: string; role: 'PLAYER' | 'ADMIN' };

export function createAccessToken(payload: TokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Требуется авторизация через Telegram' });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    req.auth = { userId: payload.sub, telegramId: payload.telegramId, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ message: 'Сессия истекла. Откройте Mini App заново.' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || !adminTelegramIds.has(req.auth.telegramId)) {
    return res.status(403).json({ message: 'Раздел доступен только администраторам' });
  }
  return next();
}
