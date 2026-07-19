import { Bot, InlineKeyboard } from 'grammy';
import { env } from './config.js';
import { prisma } from './db.js';

export const bot = env.TELEGRAM_BOT_TOKEN ? new Bot(env.TELEGRAM_BOT_TOKEN) : null;

if (bot) {
  bot.command('start', async (ctx) => {
    const keyboard = new InlineKeyboard().webApp('Открыть Poker Club', env.MINI_APP_URL);
    await ctx.reply(
      `Добро пожаловать в Poker Club, ${ctx.from?.first_name ?? 'игрок'}!\n\nЗдесь находятся игры, рейтинг сезона и ваши результаты.`,
      { reply_markup: keyboard }
    );
  });

  bot.command('app', async (ctx) => {
    await ctx.reply('Открыть приложение:', {
      reply_markup: new InlineKeyboard().webApp('Poker Club', env.MINI_APP_URL)
    });
  });

  bot.catch((error) => console.error('Telegram bot error', error.error));
}

export async function configureWebhook() {
  const publicUrl = env.PUBLIC_API_URL ?? (env.RENDER_EXTERNAL_HOSTNAME ? `https://${env.RENDER_EXTERNAL_HOSTNAME}` : undefined);
  if (!bot || !publicUrl) return;
  await bot.api.setWebhook(`${publicUrl.replace(/\/$/, '')}/telegram/webhook`, {
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message']
  });
}

export async function notifyAboutTournament(tournamentId: string) {
  if (!bot) throw new Error('TELEGRAM_BOT_TOKEN не настроен');
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new Error('Турнир не найден');
  const users = await prisma.user.findMany({ select: { telegramId: true } });
  const date = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: env.CLUB_TIMEZONE
  }).format(tournament.startsAt);
  const keyboard = new InlineKeyboard().webApp('Открыть приложение', env.MINI_APP_URL);
  let sentCount = 0;
  let failedCount = 0;

  for (const user of users) {
    try {
      await bot.api.sendMessage(user.telegramId.toString(), `♠️ Напоминание: «${tournament.title}» состоится ${date}.`, { reply_markup: keyboard });
      sentCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  await prisma.notificationLog.create({ data: { tournamentId, sentCount, failedCount } });
  return { sentCount, failedCount };
}

export async function notifyUser(telegramId: bigint | string, text: string) {
  if (!bot) return { sent: false, reason: 'BOT_DISABLED' as const };
  try {
    await bot.api.sendMessage(telegramId.toString(), text, {
      reply_markup: new InlineKeyboard().webApp('Открыть Poker Club', env.MINI_APP_URL)
    });
    return { sent: true, reason: null };
  } catch {
    return { sent: false, reason: 'DELIVERY_FAILED' as const };
  }
}

export function pointsNotification(amount: number, balanceAfter: number, reason: string) {
  const action = amount > 0 ? 'Начислено' : 'Списано';
  return `♠️ ${action} ${Math.abs(amount).toLocaleString('ru-RU')} PTS.\nПричина: ${reason}.\nНовый баланс: ${balanceAfter.toLocaleString('ru-RU')} PTS.`;
}

export function registrationNotification(title: string, startsAt: Date, status: 'REGISTERED' | 'WAITLISTED' | 'PROMOTED' | 'CANCELLED') {
  const date = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: env.CLUB_TIMEZONE
  }).format(startsAt);
  const lines = {
    REGISTERED: `Вы записаны на турнир «${title}»`,
    WAITLISTED: `Основной список «${title}» заполнен. Вы добавлены в лист ожидания`,
    PROMOTED: `Освободилось место — вы переведены в основной список турнира «${title}»`,
    CANCELLED: `Ваша запись на турнир «${title}» отменена`
  } as const;
  return `♠️ ${lines[status]}.\nНачало: ${date}.`;
}
