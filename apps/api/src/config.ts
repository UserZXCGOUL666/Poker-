import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/poker_club?schema=public'),
  JWT_SECRET: z.string().min(16).default('dev-only-secret-change-me'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  MINI_APP_URL: z.string().url().default('http://localhost:5173'),
  PUBLIC_API_URL: z.string().url().optional(),
  RENDER_EXTERNAL_HOSTNAME: z.string().optional(),
  ADMIN_TELEGRAM_IDS: z.string().default(''),
  ALLOW_DEV_AUTH: z.enum(['true', 'false']).default('false').transform((value) => value === 'true')
});

export const env = schema.parse(process.env);
export const adminTelegramIds = new Set(
  env.ADMIN_TELEGRAM_IDS.split(',').map((value) => value.trim()).filter(Boolean)
);
