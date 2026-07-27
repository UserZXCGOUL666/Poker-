import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { AppError } from './errors.js';
import { bot, configureWebhook, initializeBot } from './bot.js';
import { env, telegramWebhookSecret } from './config.js';
import { prisma } from './db.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { generateRecurringTournaments } from './services/recurringTournaments.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(compression());
app.use(cors({ origin: env.NODE_ENV === 'production' ? env.MINI_APP_URL.replace(/\/$/, '') : true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: 'ok', database: 'connected', service: 'poker-club-api' });
  } catch {
    return res.status(503).json({ status: 'degraded', database: 'unavailable', service: 'poker-club-api' });
  }
});

app.post('/telegram/webhook', async (req, res) => {
  if (!bot) return res.status(503).json({ message: 'Telegram bot не настроен' });
  if (telegramWebhookSecret && req.header('x-telegram-bot-api-secret-token') !== telegramWebhookSecret) {
    return res.status(401).end();
  }
  await initializeBot();
  await bot.handleUpdate(req.body);
  return res.status(200).end();
});

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Слишком много запросов. Повторите через минуту.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Слишком много попыток входа. Повторите позже.' }
});
app.use('/api', apiLimiter);
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api/auth/telegram', authLimiter);
app.use('/api/auth/browser', authLimiter);
app.use('/api/auth/email', authLimiter);
app.use('/api/auth', authRouter);
app.use('/api', publicRouter);
app.use('/api/admin', adminRouter);

app.use((_req, res) => res.status(404).json({ message: 'Маршрут не найден' }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: 'Проверьте введённые данные', issues: error.issues });
  }
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message, code: error.code });
  }
  console.error(error);
  const message = env.NODE_ENV === 'production'
    ? 'Внутренняя ошибка сервера'
    : error instanceof Error ? error.message : 'Внутренняя ошибка сервера';
  return res.status(500).json({ message });
});

const server = app.listen(env.PORT, async () => {
  console.log(`Poker Club API запущен на порту ${env.PORT}`);
  try {
    await initializeBot();
    await configureWebhook();
    if (bot) console.log('Telegram bot и webhook готовы');
  } catch (error) {
    console.error('Не удалось инициализировать Telegram bot или настроить webhook', error);
  }
  try { await generateRecurringTournaments(); } catch (error) { console.error('Не удалось создать повторяющиеся турниры', error); }
});

const recurringTimer = setInterval(() => {
  void generateRecurringTournaments().catch((error) => console.error('Не удалось обновить повторяющиеся турниры', error));
}, 6 * 60 * 60 * 1000);
recurringTimer.unref();

async function shutdown() {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
