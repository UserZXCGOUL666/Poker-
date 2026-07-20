import { Prisma } from '@prisma/client';
import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { env } from './config.js';
import { prisma } from './db.js';
import { writeAudit } from './services/audit.js';

export const bot = env.TELEGRAM_BOT_TOKEN ? new Bot(env.TELEGRAM_BOT_TOKEN) : null;
let cachedBotUsername: string | null | undefined;

function miniAppUrlWithReferral(rawMatch: string | undefined) {
  const code = rawMatch?.trim().replace(/^ref[_-]?/i, '').toUpperCase();
  if (!code || !/^[A-Z0-9]{6,20}$/.test(code)) return env.MINI_APP_URL;
  const url = new URL(env.MINI_APP_URL);
  url.searchParams.set('ref', code);
  return url.toString();
}

if (bot) {
  bot.command('start', async (ctx) => {
    const referralMatch = typeof ctx.match === 'string' ? ctx.match : undefined;
    const keyboard = new InlineKeyboard().webApp('Открыть Poker Club', miniAppUrlWithReferral(referralMatch));
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

  bot.command('phone', async (ctx) => {
    await ctx.reply('Нажмите кнопку ниже, если хотите добровольно передать номер организаторам клуба.', {
      reply_markup: new Keyboard().requestContact('📱 Поделиться номером').resized().oneTime()
    });
  });

  bot.on('message:contact', async (ctx) => {
    const sender = ctx.from;
    const contact = ctx.message.contact;
    if (!sender || (contact.user_id && String(contact.user_id) !== String(sender.id))) {
      await ctx.reply('Можно сохранить только ваш собственный номер.');
      return;
    }
    const digits = contact.phone_number.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      await ctx.reply('Telegram передал номер в неизвестном формате. Попробуйте ещё раз позже.');
      return;
    }
    const phoneNumber = `+${digits}`;
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(sender.id) } });
    if (!user) {
      await ctx.reply('Сначала откройте Mini App и войдите в клуб, затем повторите отправку номера.');
      return;
    }
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { phoneNumber, phoneSharedAt: new Date() } });
        await writeAudit(tx, {
          actorId: user.id,
          action: 'PHONE_SHARED',
          entityType: 'User',
          entityId: user.id,
          summary: `${user.firstName} добровольно передал номер телефона`,
          metadata: { source: 'telegram_contact' }
        });
      });
      await ctx.reply('✅ Номер сохранён. Он доступен только администраторам клуба.', { reply_markup: { remove_keyboard: true } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        await ctx.reply('Этот номер уже связан с другим аккаунтом клуба. Напишите администратору.', { reply_markup: { remove_keyboard: true } });
        return;
      }
      throw error;
    }
  });

  bot.catch((error) => console.error('Telegram bot error', error.error));
}

export async function getBotUsername() {
  if (cachedBotUsername !== undefined) return cachedBotUsername;
  if (!bot) return (cachedBotUsername = null);
  try {
    const me = await bot.api.getMe();
    cachedBotUsername = me.username;
  } catch {
    cachedBotUsername = null;
  }
  return cachedBotUsername;
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
