"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOT_USERNAME = exports.ADMIN_IDS = exports.WEBHOOK_URL = exports.WEBHOOK_SECRET = exports.BOT_TOKEN = void 0;
exports.escapeHtml = escapeHtml;
exports.tg = tg;
exports.getMessageText = getMessageText;
exports.messageHasPhoto = messageHasPhoto;
exports.messageHasImage = messageHasImage;
exports.downloadMessageImages = downloadMessageImages;
exports.sendMessage = sendMessage;
exports.sendPlain = sendPlain;
exports.notifyAdmins = notifyAdmins;
exports.sendPhoto = sendPhoto;
exports.editMarkup = editMarkup;
exports.answerCallback = answerCallback;
exports.getChatMember = getChatMember;
exports.isChatAdmin = isChatAdmin;
exports.answerPreCheckout = answerPreCheckout;
exports.sendInvoice = sendInvoice;
exports.initBotInfo = initBotInfo;
exports.setWebhook = setWebhook;
exports.setMyCommands = setMyCommands;
const node_fetch_1 = __importDefault(require("node-fetch"));
const crypto_1 = __importDefault(require("crypto"));
const emoji_1 = require("./emoji");
exports.BOT_TOKEN = process.env.BOT_TOKEN ?? '';
// Secret used to authenticate incoming webhook calls. Telegram echoes it back in
// the `X-Telegram-Bot-Api-Secret-Token` header on every update, so we can reject
// anyone POSTing to the webhook who is not Telegram — defense in depth on top of
// the bot-token-in-path. Defaults to a stable value derived from the bot token
// so the gate works without extra configuration, but can be overridden.
exports.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ||
    crypto_1.default.createHash('sha256').update(`whk:${exports.BOT_TOKEN}`).digest('hex').slice(0, 48);
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
// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Escapes the 3 characters that are significant in Telegram's HTML parse mode.
 * Apply to ANY user-controlled value before interpolating it into an HTML
 * message, otherwise malformed input breaks our own messages (Telegram rejects
 * invalid HTML) or lets a user inject markup/links into the rendered text.
 */
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
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
function getMessageText(msg) {
    return (msg.text ?? msg.caption ?? '').trim();
}
function messageHasPhoto(msg) {
    return (msg.photo?.length ?? 0) > 0;
}
/** Photo attachment or image sent as a document (PNG/JPEG/WebP/GIF). */
function messageHasImage(msg) {
    if (messageHasPhoto(msg))
        return true;
    const mime = msg.document?.mime_type ?? '';
    return mime.startsWith('image/');
}
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
function guessMimeFromPath(filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'png')
        return 'image/png';
    if (ext === 'webp')
        return 'image/webp';
    if (ext === 'gif')
        return 'image/gif';
    return 'image/jpeg';
}
/** Downloads image(s) from a Telegram message for forwarding to Cursor SDK. */
async function downloadMessageImages(msg) {
    if (msg.photo?.length) {
        const photo = msg.photo[msg.photo.length - 1];
        const img = await downloadTelegramFile(photo.file_id, photo.width, photo.height);
        return img ? [img] : [];
    }
    if (msg.document?.mime_type?.startsWith('image/')) {
        const img = await downloadTelegramFile(msg.document.file_id, undefined, undefined, msg.document.mime_type);
        return img ? [img] : [];
    }
    return [];
}
async function downloadTelegramFile(fileId, width, height, mimeHint) {
    const meta = await tg('getFile', { file_id: fileId });
    if (meta.file_size && meta.file_size > MAX_IMAGE_BYTES)
        return null;
    const url = `https://api.telegram.org/file/bot${exports.BOT_TOKEN}/${meta.file_path}`;
    const res = await (0, node_fetch_1.default)(url);
    if (!res.ok)
        return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES)
        return null;
    return {
        data: buf.toString('base64'),
        mimeType: mimeHint ?? guessMimeFromPath(meta.file_path),
        width,
        height,
    };
}
async function sendMessage(chatId, text, extra = {}) {
    try {
        await tg('sendMessage', {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...extra,
        });
    }
    catch (e) {
        // Fall back to plain emoji if premium custom emoji can't be sent
        if (text.includes('<tg-emoji')) {
            await tg('sendMessage', {
                chat_id: chatId,
                text: (0, emoji_1.stripCustomEmoji)(text),
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...extra,
            });
            return;
        }
        throw e;
    }
}
/**
 * Sends plain text (no HTML parsing). Use for arbitrary/untrusted content such
 * as a Cursor agent's answer, which may contain `<`, `>` or code that would
 * break HTML parse mode. Long messages are split to fit Telegram's 4096 limit.
 */
async function sendPlain(chatId, text) {
    const CHUNK = 3900;
    const body = text.length > 0 ? text : '(пустой ответ)';
    for (let i = 0; i < body.length; i += CHUNK) {
        await tg('sendMessage', {
            chat_id: chatId,
            text: body.slice(i, i + CHUNK),
            disable_web_page_preview: true,
        });
    }
}
/** Broadcasts a short notice to every configured admin (best-effort). */
async function notifyAdmins(text) {
    await Promise.all(exports.ADMIN_IDS.map(id => sendMessage(id, text).catch(() => { })));
}
async function sendPhoto(chatId, photo, caption, extra = {}) {
    try {
        await tg('sendPhoto', {
            chat_id: chatId,
            photo,
            caption,
            parse_mode: 'HTML',
            ...extra,
        });
    }
    catch (e) {
        if (caption.includes('<tg-emoji')) {
            await tg('sendPhoto', {
                chat_id: chatId,
                photo,
                caption: (0, emoji_1.stripCustomEmoji)(caption),
                parse_mode: 'HTML',
                ...extra,
            });
            return;
        }
        throw e;
    }
}
async function editMarkup(chatId, messageId, markup) {
    await tg('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: markup ?? {},
    });
}
async function answerCallback(callbackQueryId, text, showAlert = false) {
    await tg('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        ...(text ? { text, show_alert: showAlert } : {}),
    });
}
async function getChatMember(chatId, userId) {
    return tg('getChatMember', { chat_id: chatId, user_id: userId });
}
/**
 * Whether the user is the owner or an administrator of the given chat/channel.
 * Returns false if the status can't be resolved (e.g. user not in the chat,
 * or the bot lacks rights to query members).
 */
async function isChatAdmin(chatId, userId) {
    try {
        const m = await getChatMember(chatId, userId);
        return m.status === 'creator' || m.status === 'administrator';
    }
    catch {
        return false;
    }
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
    await tg('setWebhook', {
        url,
        drop_pending_updates: true,
        secret_token: exports.WEBHOOK_SECRET,
        max_connections: 40,
    });
    console.log(`Webhook set: ${url}`);
}
async function setMyCommands() {
    await tg('setMyCommands', {
        commands: [
            { command: 'add', description: 'Добавить кнопки к посту' },
            { command: 'remove', description: 'Удалить кнопки с поста' },
            { command: 'templates', description: 'Мои шаблоны кнопок' },
            { command: 'schedule', description: 'Отложить добавление кнопок' },
            { command: 'premium', description: 'Тариф и подписка' },
            { command: 'ref', description: 'Реферальная программа' },
            { command: 'help', description: 'Помощь' },
        ],
    });
}
