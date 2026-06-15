"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStatsCommand = handleStatsCommand;
exports.handlePostStats = handlePostStats;
const tg_1 = require("../tg");
const emoji_1 = require("../emoji");
const db_1 = require("../db");
const parser_1 = require("../parser");
// /stats — show analytics or toggle tracking
async function handleStatsCommand(userId, chatId, arg) {
    const premium = await (0, db_1.isPremium)(userId);
    if (!premium) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('chart')} <b>Аналитика кликов</b> — функция Premium.\n\n` +
            `Автоматически считает клики по каждой кнопке в твоих постах.\n\n` +
            `${(0, emoji_1.ce)('gem')} /premium — подключить`);
        return;
    }
    const trimmed = arg.trim().toLowerCase();
    if (trimmed === 'on' || trimmed === 'вкл') {
        await (0, db_1.setStatsEnabled)(userId, true);
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('eye')} <b>Отслеживание кликов включено!</b>\n\n` +
            `Теперь при /add все URL кнопок автоматически становятся отслеживаемыми.\n` +
            `Клики считаются и доступны по команде /stats`);
        return;
    }
    if (trimmed === 'off' || trimmed === 'выкл') {
        await (0, db_1.setStatsEnabled)(userId, false);
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('noentry')} Отслеживание кликов выключено.`);
        return;
    }
    // Show stats
    const user = await (0, db_1.getUser)(userId);
    const enabled = user?.stats_enabled ?? false;
    if (!enabled) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('chart')} <b>Аналитика кликов</b>\n\nОтслеживание: <b>выключено</b>\n\nВключи командой <code>/stats on</code> — и каждая новая кнопка будет считать клики.`);
        return;
    }
    const links = await (0, db_1.getUserTrackedLinks)(userId);
    if (links.length === 0) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('chartup')} <b>Аналитика кликов</b>\n\nОтслеживание: <b>включено</b> ${(0, emoji_1.ce)('check')}\n\nДанных пока нет. Добавь кнопки командой /add — клики начнут считаться.`);
        return;
    }
    const totalClicks = links.reduce((s, l) => s + l.clicks, 0);
    const lines = links
        .slice(0, 10)
        .map(l => {
        const postRef = `${l.post_chat_id}/${l.post_message_id}`;
        return `• <b>${l.button_label}</b> — ${l.clicks} кл. <i>(${postRef})</i>`;
    })
        .join('\n');
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('chartup')} <b>Аналитика кликов</b>\n\nОтслеживание: <b>включено</b> ${(0, emoji_1.ce)('check')}\nВсего кликов: <b>${totalClicks}</b>\n\n${lines}` +
        (links.length > 10 ? `\n\n<i>и ещё ${links.length - 10}...</i>` : '') +
        `\n\n<b>Статистика по посту:</b> отправь /stats и ссылку на пост`);
}
// /stats <post_link> — stats for specific post
async function handlePostStats(userId, chatId, text) {
    const premium = await (0, db_1.isPremium)(userId);
    if (!premium) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('gem')} Аналитика доступна в Premium. /premium`);
        return;
    }
    const parsed = (0, parser_1.parsePostLink)(text);
    if (!parsed) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Не распознал ссылку на пост.`);
        return;
    }
    const links = await (0, db_1.getPostStats)(userId, String(parsed.chatId), parsed.messageId);
    if (links.length === 0) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('chart')} По этому посту нет данных. Убедись, что кнопки добавлены с отслеживанием.`);
        return;
    }
    const total = links.reduce((s, l) => s + l.clicks, 0);
    const lines = links
        .map(l => `• <b>${l.button_label}</b>\n  ${l.clicks} кликов → <code>${l.original_url}</code>`)
        .join('\n\n');
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('chartup')} <b>Статистика поста</b>\n\nВсего кликов: <b>${total}</b>\n\n${lines}`);
}
