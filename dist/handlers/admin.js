"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminCommand = handleAdminCommand;
exports.handleGrantPremium = handleGrantPremium;
exports.handleBroadcast = handleBroadcast;
exports.handleBroadcastText = handleBroadcastText;
const tg_1 = require("../tg");
const emoji_1 = require("../emoji");
const db_1 = require("../db");
const ratelimit_1 = require("../ratelimit");
function isAdmin(userId) {
    return tg_1.ADMIN_IDS.includes(userId);
}
/** Logs and rejects a non-admin trying to reach an admin-only action. */
function denyIfNotAdmin(userId, action) {
    if (isAdmin(userId))
        return false;
    console.warn(`[security] Unauthorized admin attempt: user=${userId} action=${action}`);
    // Alert admins, but at most once per minute so it can't be used to spam them.
    if ((0, ratelimit_1.hit)('admin-alert', 1, 60000).allowed) {
        void (0, tg_1.notifyAdmins)(`${(0, emoji_1.ce)('lock')} Попытка доступа к админ-команде <code>${action}</code> от пользователя <code>${userId}</code>.`);
    }
    return true;
}
// /admin — statistics panel
async function handleAdminCommand(userId, chatId) {
    if (denyIfNotAdmin(userId, '/admin'))
        return;
    const s = await (0, db_1.getAdminStats)();
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('lock')} <b>Admin Panel</b>\n\n` +
        `${(0, emoji_1.ce)('people')} Всего пользователей: <b>${s.totalUsers}</b>\n` +
        `${(0, emoji_1.ce)('crown')} Premium: <b>${s.premiumUsers}</b>\n` +
        `${(0, emoji_1.ce)('bolt')} DAU (24ч): <b>${s.dau}</b>\n` +
        `${(0, emoji_1.ce)('dividers')} Шаблонов: <b>${s.totalTemplates}</b>\n` +
        `${(0, emoji_1.ce)('alarm')} Задач в очереди: <b>${s.pendingTasks}</b>\n` +
        `${(0, emoji_1.ce)('money')} Оплат: <b>${s.totalPayments}</b>\n\n` +
        `<b>Команды:</b>\n` +
        `/grant_premium USER_ID MONTHS\n` +
        `/broadcast ТЕКСТ\n` +
        `/cursor — связь с Cursor (задачи по коду)`);
}
// /grant_premium USER_ID MONTHS
async function handleGrantPremium(adminId, chatId, arg) {
    if (denyIfNotAdmin(adminId, '/grant_premium'))
        return;
    const parts = arg.trim().split(/\s+/);
    const userId = parseInt(parts[0] ?? '', 10);
    const months = parseInt(parts[1] ?? '1', 10);
    if (isNaN(userId) || isNaN(months) || months < 1) {
        await (0, tg_1.sendMessage)(chatId, 'Использование: /grant_premium USER_ID MONTHS');
        return;
    }
    const user = await (0, db_1.getUser)(userId);
    if (!user) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Пользователь ${userId} не найден в БД.`);
        return;
    }
    await (0, db_1.grantPremium)(userId, months);
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('check')} Premium выдан: ${userId} на ${months} месяцев.`);
    // Notify the user
    await (0, tg_1.sendMessage)(userId, `${(0, emoji_1.ce)('gift')} Тебе выдан <b>Premium на ${months} месяцев</b>!\n\nПриятного использования ${(0, emoji_1.ce)('crown')}`).catch(() => { });
}
// /broadcast TEXT — send to all users (rate-limited)
async function handleBroadcast(adminId, chatId, text, states) {
    if (denyIfNotAdmin(adminId, '/broadcast'))
        return;
    if (!text.trim()) {
        states.set(adminId, { step: 'waiting_broadcast_text' });
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('megaphone')} Введи текст для рассылки:\n\n/cancel — отмена`);
        return;
    }
    await doBroadcast(adminId, chatId, text.trim());
}
async function handleBroadcastText(adminId, chatId, text, states) {
    states.set(adminId, { step: 'idle' });
    if (denyIfNotAdmin(adminId, '/broadcast:text'))
        return;
    await doBroadcast(adminId, chatId, text.trim());
}
async function doBroadcast(adminId, chatId, text) {
    const userIds = await (0, db_1.getAllUserIds)();
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('megaphone')} Начинаю рассылку ${userIds.length} пользователям...`);
    let sent = 0;
    let failed = 0;
    for (const uid of userIds) {
        try {
            await (0, tg_1.sendMessage)(uid, text);
            sent++;
        }
        catch {
            failed++;
        }
        // ~30 messages/second to respect Telegram rate limits
        await sleep(35);
    }
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('check')} Рассылка завершена.\nОтправлено: ${sent}\nОшибок: ${failed}`);
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
