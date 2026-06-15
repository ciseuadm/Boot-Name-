"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleScheduleCommand = handleScheduleCommand;
exports.handleQueueCommand = handleQueueCommand;
exports.handleCancelTask = handleCancelTask;
exports.handleScheduleLink = handleScheduleLink;
exports.handleScheduleButtons = handleScheduleButtons;
exports.handleScheduleTime = handleScheduleTime;
const tg_1 = require("../tg");
const emoji_1 = require("../emoji");
const db_1 = require("../db");
const parser_1 = require("../parser");
const db_2 = require("../db");
// ── /schedule command ─────────────────────────────────────────────────────────
async function handleScheduleCommand(userId, chatId, states) {
    const premium = await (0, db_1.isPremium)(userId);
    if (!premium) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('alarm')} <b>Отложенные кнопки</b> — функция Premium.\n\n` +
            `Позволяет применить кнопки к посту через заданное время — например, через час после публикации.\n\n` +
            `${(0, emoji_1.ce)('gem')} /premium — подключить`);
        return;
    }
    states.set(userId, { step: 'waiting_schedule_link' });
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('alarm')} <b>Отложенные кнопки</b>\n\n` +
        `Шаг 1/3: ${(0, emoji_1.ce)('link')} Отправь ссылку на пост:\n\n/cancel — отмена`);
}
// ── /queue — список отложенных задач ─────────────────────────────────────────
async function handleQueueCommand(userId, chatId) {
    const tasks = await (0, db_1.getUserScheduledTasks)(userId);
    if (tasks.length === 0) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('bulb')} У тебя нет запланированных задач.`);
        return;
    }
    const lines = tasks.map((t, i) => {
        const date = new Date(t.run_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
        return `${i + 1}. ID <code>${t.id}</code> — ${date} МСК\n   Пост: ${t.post_chat_id}/${t.post_message_id}`;
    });
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('alarm')} <b>Запланированные задачи</b>:\n\n${lines.join('\n\n')}\n\n` +
        `Отменить: <code>/cancel_task ID</code>`);
}
async function handleCancelTask(userId, chatId, arg) {
    const id = parseInt(arg.trim(), 10);
    if (isNaN(id)) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Укажи ID задачи: <code>/cancel_task 42</code>`);
        return;
    }
    const cancelled = await (0, db_1.cancelScheduledTask)(id, userId);
    if (cancelled) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('check')} Задача #${id} отменена.`);
    }
    else {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Задача #${id} не найдена или уже выполнена.`);
    }
}
// ── State handlers ────────────────────────────────────────────────────────────
async function handleScheduleLink(userId, chatId, text, states) {
    const parsed = (0, parser_1.parsePostLink)(text);
    if (!parsed) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Не распознал ссылку. Попробуй ещё раз.\n\n/cancel — отмена`);
        return;
    }
    states.set(userId, {
        step: 'waiting_schedule_buttons',
        chatId: parsed.chatId,
        messageId: parsed.messageId,
    });
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('radio')} Пост найден!\n\nШаг 2/3: ${(0, emoji_1.ce)('puzzle')} Отправь кнопки (формат: <code>Текст | URL</code>):\n\n/cancel — отмена`);
}
async function handleScheduleButtons(userId, chatId, text, state, states) {
    const rows = (0, parser_1.parseButtons)(text, db_2.PREMIUM_MAX_BUTTONS);
    if (!rows) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Не смог разобрать кнопки. Формат: <code>Текст | URL</code>\n\n/cancel — отмена`);
        return;
    }
    states.set(userId, {
        step: 'waiting_schedule_time',
        chatId: state.chatId,
        messageId: state.messageId,
        buttonsText: text,
    });
    const preview = (0, parser_1.formatButtonPreview)(rows);
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('check')} Кнопки:\n<code>${preview}</code>\n\n` +
        `Шаг 3/3: ${(0, emoji_1.ce)('bell')} Через сколько часов применить?\n` +
        `Введи число от 1 до 168 (7 дней):\n\n/cancel — отмена`);
}
async function handleScheduleTime(userId, chatId, text, state, states) {
    const hours = parseFloat(text.trim().replace(',', '.'));
    if (isNaN(hours) || hours < 0.1 || hours > 168) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Введи число от 0.1 до 168 (часы).\n\nНапример: <code>1</code>, <code>2.5</code>, <code>24</code>`);
        return;
    }
    const runAt = new Date(Date.now() + hours * 3600 * 1000);
    const task = await (0, db_1.createScheduledTask)(userId, String(state.chatId), state.messageId, state.buttonsText, runAt);
    states.set(userId, { step: 'idle' });
    const timeStr = runAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('check')} <b>Задача создана!</b>\n\nID: <code>${task.id}</code>\nВремя: ${timeStr} МСК\n\nПосмотреть очередь: /queue\nОтменить: <code>/cancel_task ${task.id}</code>`);
}
