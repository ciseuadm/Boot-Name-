import { sendMessage, ADMIN_IDS, tg } from '../tg';
import { getAdminStats, getAllUserIds, grantPremium, getUser } from '../db';
import type { UserState } from '../bot';

function isAdmin(userId: number): boolean {
  return ADMIN_IDS.includes(userId);
}

// /admin — statistics panel
export async function handleAdminCommand(userId: number, chatId: number): Promise<void> {
  if (!isAdmin(userId)) return;

  const s = await getAdminStats();

  await sendMessage(
    chatId,
    `🛠 <b>Admin Panel</b>\n\n` +
      `👥 Всего пользователей: <b>${s.totalUsers}</b>\n` +
      `⭐ Premium: <b>${s.premiumUsers}</b>\n` +
      `📆 DAU (24ч): <b>${s.dau}</b>\n` +
      `📋 Шаблонов: <b>${s.totalTemplates}</b>\n` +
      `⏰ Задач в очереди: <b>${s.pendingTasks}</b>\n` +
      `💳 Оплат: <b>${s.totalPayments}</b>\n` +
      `📊 Всего кликов: <b>${s.totalClicks}</b>\n\n` +
      `<b>Команды:</b>\n` +
      `/grant_premium USER_ID MONTHS\n` +
      `/broadcast ТЕКСТ`,
  );
}

// /grant_premium USER_ID MONTHS
export async function handleGrantPremium(
  adminId: number,
  chatId: number,
  arg: string,
): Promise<void> {
  if (!isAdmin(adminId)) return;

  const parts = arg.trim().split(/\s+/);
  const userId = parseInt(parts[0] ?? '', 10);
  const months = parseInt(parts[1] ?? '1', 10);

  if (isNaN(userId) || isNaN(months) || months < 1) {
    await sendMessage(chatId, 'Использование: /grant_premium USER_ID MONTHS');
    return;
  }

  const user = await getUser(userId);
  if (!user) {
    await sendMessage(chatId, `❌ Пользователь ${userId} не найден в БД.`);
    return;
  }

  await grantPremium(userId, months);
  await sendMessage(chatId, `✅ Premium выдан: ${userId} на ${months} месяцев.`);

  // Notify the user
  await sendMessage(
    userId,
    `🎁 Тебе выдан <b>Premium на ${months} месяцев</b>!\n\nПриятного использования ⭐`,
  ).catch(() => {});
}

// /broadcast TEXT — send to all users (rate-limited)
export async function handleBroadcast(
  adminId: number,
  chatId: number,
  text: string,
  states: Map<number, UserState>,
): Promise<void> {
  if (!isAdmin(adminId)) return;

  if (!text.trim()) {
    states.set(adminId, { step: 'waiting_broadcast_text' });
    await sendMessage(chatId, '📢 Введи текст для рассылки:\n\n❌ /cancel — отмена');
    return;
  }

  await doBroadcast(adminId, chatId, text.trim());
}

export async function handleBroadcastText(
  adminId: number,
  chatId: number,
  text: string,
  states: Map<number, UserState>,
): Promise<void> {
  states.set(adminId, { step: 'idle' });
  await doBroadcast(adminId, chatId, text.trim());
}

async function doBroadcast(adminId: number, chatId: number, text: string): Promise<void> {
  const userIds = await getAllUserIds();
  await sendMessage(chatId, `📢 Начинаю рассылку ${userIds.length} пользователям...`);

  let sent = 0;
  let failed = 0;

  for (const uid of userIds) {
    try {
      await sendMessage(uid, text);
      sent++;
    } catch {
      failed++;
    }
    // ~30 messages/second to respect Telegram rate limits
    await sleep(35);
  }

  await sendMessage(chatId, `✅ Рассылка завершена.\nОтправлено: ${sent}\nОшибок: ${failed}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
