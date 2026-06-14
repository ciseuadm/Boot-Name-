"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOT_USERNAME = exports.ADMIN_IDS = exports.WEBHOOK_URL = exports.BOT_TOKEN = void 0;
exports.tg = tg;
exports.sendMessage = sendMessage;
exports.editMarkup = editMarkup;
exports.answerCallback = answerCallback;
exports.answerPreCheckout = answerPreCheckout;
exports.sendInvoice = sendInvoice;
exports.initBotInfo = initBotInfo;
exports.setWebhook = setWebhook;
exports.setMyCommands = setMyCommands;
const node_fetch_1 = __importDefault(require("node-fetch"));
exports.BOT_TOKEN = process.env.BOT_TOKEN ?? '';
// Railway provides RAILWAY_PUBLIC_DOMAIN automatically — no manual WEBHOOK_URL needed
exports.WEBHOOK_URL = process.env.WEBHOOK_URL ??
    (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : '');
exports.ADMIN_IDS = (process.env.ADMIN_IDS ?? '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(Boolean);
if (!exports.BOT_TOKEN)
    throw new Error('BOT_TOKEN env var is required');
const API = `https://api.telegram.org/bot${exports.BOT_TOKEN}`;
exports.BOT_USERNAME = '';
// ─── Core API call ──────────────────────────────────────────────────────────
async function tg(method, body) {
    const res = await (0, node_fetch_1.default)(`${API}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok)
        throw new Error(data.description ?? 'Telegram API error');
    return data.result;
}
// ─── Message helpers ────────────────────────────────────────────────────────
async function sendMessage(chatId, text, extra = {}) {
    await tg('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...extra,
    });
}
async function editMarkup(chatId, messageId, markup) {
    await tg('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: markup ?? {},
    });
}
async function answerCallback(callbackQueryId, text) {
    await tg('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        ...(text ? { text, show_alert: false } : {}),
    });
}
async function answerPreCheckout(preCheckoutQueryId, ok, errorMessage) {
    await tg('answerPreCheckoutQuery', {
        pre_checkout_query_id: preCheckoutQueryId,
        ok,
        ...(errorMessage ? { error_message: errorMessage } : {}),
    });
}
async function sendInvoice(chatId, title, description, payload, labelText, starsAmount, extra = {}) {
    await tg('sendInvoice', {
        chat_id: chatId,
        title,
        description,
        payload,
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: labelText, amount: starsAmount }],
        ...extra,
    });
}
// ─── Bot info ────────────────────────────────────────────────────────────────
async function initBotInfo() {
    const me = await tg('getMe', {});
    exports.BOT_USERNAME = me.username;
}
async function setWebhook() {
    if (!exports.WEBHOOK_URL) {
        console.log('No WEBHOOK_URL — skipping webhook setup');
        return;
    }
    const url = `${exports.WEBHOOK_URL}/webhook/${exports.BOT_TOKEN}`;
    await tg('setWebhook', { url, drop_pending_updates: true });
    console.log(`Webhook set: ${url}`);
}
async function setMyCommands() {
    await tg('setMyCommands', {
        commands: [
            { command: 'add', description: 'Добавить кнопки к посту' },
            { command: 'remove', description: 'Удалить кнопки с поста' },
            { command: 'templates', description: 'Мои шаблоны кнопок' },
            { command: 'schedule', description: 'Отложить добавление кнопок' },
            { command: 'stats', description: 'Аналитика кликов по кнопкам' },
            { command: 'premium', description: 'Тариф и подписка' },
            { command: 'ref', description: 'Реферальная программа' },
            { command: 'help', description: 'Помощь' },
        ],
    });
}
