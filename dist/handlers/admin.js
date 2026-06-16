"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminCommand = handleAdminCommand;
exports.handleGrantPremium = handleGrantPremium;
exports.handleBroadcast = handleBroadcast;
exports.handleBroadcastText = handleBroadcastText;
const tg_1 = require("../tg");
const emoji_1 = require("../emoji");
const db_1 = require("../db");
function isAdmin(userId) {
    return tg_1.ADMIN_IDS.includes(userId);
}
// /admin — statistics panel
async function handleAdminCommand(userId, chatId) {
    if (!isAdmin(userId))
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
        `/broadcast ТЕКСТ`);
}
// /grant_premium USER_ID MONTHS
async function handleGrantPremium(adminId, chatId, arg) {
    if (!isAdmin(adminId))
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
    if (!isAdmin(adminId))
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
