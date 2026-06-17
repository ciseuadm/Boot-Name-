import { sendMessage, notifyAdmins, ADMIN_IDS, tg } from '../tg';
import { ce } from '../emoji';
import { getAdminStats, getAllUserIds, grantPremium, getUser } from '../db';
import { hit } from '../ratelimit';
import type { UserState } from '../bot';

function isAdmin(userId: number): boolean {
  return ADMIN_IDS.includes(userId);
}

/** Logs and rejects a non-admin trying to reach an admin-only action. */
function denyIfNotAdmin(userId: number, action: string): boolean {
  if (isAdmin(userId)) return false;
  console.warn(`[security] Unauthorized admin attempt: user=${userId} action=${action}`);
  // Alert admins, but at most once per minute so it can't be used to spam them.
  if (hit('admin-alert', 1, 60_000).allowed) {
    void notifyAdmins(
      `${ce('lock')} Попытка доступа к админ-команде <code>${action}</code> от пользователя <code>${userId}</code>.`,
    );
  }
  return true;
}

// /admin — statistics panel
export async function handleAdminCommand(userId: number, chatId: number): Promise<void> {
  if (denyIfNotAdmin(userId, '/admin')) return;

  const s = await getAdminStats();

  await sendMessage(
    chatId,
    `${ce('lock')} <b>Admin Panel</b>\n\n` +
      `${ce('people')} Всего пользователей: <b>${s.totalUsers}</b>\n` +
      `${ce('crown')} Premium: <b>${s.premiumUsers}</b>\n` +
      `${ce('bolt')} DAU (24ч): <b>${s.dau}</b>\n` +
      `${ce('dividers')} Шаблонов: <b>${s.totalTemplates}</b>\n` +
      `${ce('alarm')} Задач в очереди: <b>${s.pendingTasks}</b>\n` +
      `${ce('money')} Оплат: <b>${s.totalPayments}</b>\n\n` +
      `<b>Команды:</b>\n` +
      `/grant_premium USER_ID MONTHS\n` +
      `/broadcast ТЕКСТ\n` +
      `/cursor — связь с Cursor (задачи по коду)`,
  );
}

// /grant_premium USER_ID MONTHS
export async function handleGrantPremium(
  adminId: number,
  chatId: number,
  arg: string,
): Promise<void> {
  if (denyIfNotAdmin(adminId, '/grant_premium')) return;

  const parts = arg.trim().split(/\s+/);
  const userId = parseInt(parts[0] ?? '', 10);
  const months = parseInt(parts[1] ?? '1', 10);

  if (isNaN(userId) || isNaN(months) || months < 1) {
    await sendMessage(chatId, 'Использование: /grant_premium USER_ID MONTHS');
    return;
  }

  const user = await getUser(userId);
  if (!user) {
    await sendMessage(chatId, `${ce('cross')} Пользователь ${userId} не найден в БД.`);
    return;
  }

  await grantPremium(userId, months);
  await sendMessage(chatId, `${ce('check')} Premium выдан: ${userId} на ${months} месяцев.`);

  // Notify the user
  await sendMessage(
    userId,
    `${ce('gift')} Тебе выдан <b>Premium на ${months} месяцев</b>!\n\nПриятного использования ${ce('crown')}`,
  ).catch(() => {});
}

// /broadcast TEXT — send to all users (rate-limited)
export async function handleBroadcast(
  adminId: number,
  chatId: number,
  text: string,
  states: Map<number, UserState>,
): Promise<void> {
  if (denyIfNotAdmin(adminId, '/broadcast')) return;

  if (!text.trim()) {
    states.set(adminId, { step: 'waiting_broadcast_text' });
    await sendMessage(chatId, `${ce('megaphone')} Введи текст для рассылки:\n\n/cancel — отмена`);
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
  if (denyIfNotAdmin(adminId, '/broadcast:text')) return;
  await doBroadcast(adminId, chatId, text.trim());
}

async function doBroadcast(adminId: number, chatId: number, text: string): Promise<void> {
  const userIds = await getAllUserIds();
  await sendMessage(chatId, `${ce('megaphone')} Начинаю рассылку ${userIds.length} пользователям...`);

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

  await sendMessage(chatId, `${ce('check')} Рассылка завершена.\nОтправлено: ${sent}\nОшибок: ${failed}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
