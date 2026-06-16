"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleUpdate = handleUpdate;
const tg_1 = require("./tg");
const emoji_1 = require("./emoji");
const db_1 = require("./db");
const gate_1 = require("./handlers/gate");
const add_1 = require("./handlers/add");
const remove_1 = require("./handlers/remove");
const templates_1 = require("./handlers/templates");
const premium_1 = require("./handlers/premium");
const referral_1 = require("./handlers/referral");
const schedule_1 = require("./handlers/schedule");
const stats_1 = require("./handlers/stats");
const admin_1 = require("./handlers/admin");
const states = new Map();
function getState(userId) {
    return states.get(userId) ?? { step: 'idle' };
}
// ─── Start message ──────────────────────────────────────────────────────────
// Short, attractive caption shown with the avatar on /start
const WELCOME = `${(0, emoji_1.ce)('check')} <b>Add Button Bot</b>

Добавляю, меняю и удаляю кнопки под любым постом канала — <b>пост остаётся нетронутым</b>.

${(0, emoji_1.ce)('ninja')} Без пометки «изменено» — пост не меняется
${(0, emoji_1.ce)('noentry')} Без рекламных подписей, как у Postbot
${(0, emoji_1.ce)('star')} С премиум-эмодзи в постах
${(0, emoji_1.ce)('bolt')} Кнопки появляются за пару секунд
${(0, emoji_1.ce)('chart')} Аналитика кликов · ${(0, emoji_1.ce)('alarm')} отложенный постинг

<b>Старт за 3 шага:</b>
${(0, emoji_1.ce)('num1')} Добавь меня в админы канала
${(0, emoji_1.ce)('num2')} Включи право «Редактировать сообщения»
${(0, emoji_1.ce)('num3')} Жми /add ${(0, emoji_1.ce)('rocket')}

Все команды — /help`;
// Full command reference shown on /help
const HELP = `${(0, emoji_1.ce)('check')}  <b>Add Button Bot</b>

Добавляю, меняю и удаляю кнопки под постами канала — без пометки «изменено» и без рекламных подписей на постах.

<b>Команды:</b>

${(0, emoji_1.ce)('plus')} /add — добавить кнопки к посту
${(0, emoji_1.ce)('trash')} /remove — удалить кнопки с поста
${(0, emoji_1.ce)('dividers')} /templates — шаблоны кнопок
${(0, emoji_1.ce)('alarm')} /schedule — отложить добавление
${(0, emoji_1.ce)('chartup')} /stats — аналитика кликов
${(0, emoji_1.ce)('gem')} /premium — тариф и подписка
${(0, emoji_1.ce)('handshake')} /ref — реферальная программа

${(0, emoji_1.ce)('star')} /schedule и /stats доступны в Premium

<b>${(0, emoji_1.ce)('bulb')} Как начать:</b>

Добавь меня в администраторы своего канала
Выдай право «Редактировать сообщения»
Отправь /add и следуй инструкции`;
const BANNER_URL = tg_1.WEBHOOK_URL ? `${tg_1.WEBHOOK_URL}/banner.png` : '';
async function sendWelcome(chatId, caption) {
    if (BANNER_URL) {
        try {
            await (0, tg_1.sendPhoto)(chatId, BANNER_URL, caption);
            return;
        }
        catch {
            // Fall back to plain text if photo delivery fails
        }
    }
    await (0, tg_1.sendMessage)(chatId, caption);
}
// Referral codes captured from /start while the user was still behind the gate,
// applied once they pass the subscription check.
const pendingRef = new Map();
/** Runs the /start welcome flow, optionally crediting a referral code. */
async function startFlow(userId, chatId, firstName, param) {
    states.set(userId, { step: 'idle' });
    let isNewRef = false;
    if (param.startsWith('ref_')) {
        const code = param.slice(4);
        const user = await Promise.resolve().then(() => __importStar(require('./db'))).then(m => m.getUser(userId));
        if (!user?.referred_by) {
            isNewRef = true;
            await (0, referral_1.processReferral)(userId, code);
            const referrer = await Promise.resolve().then(() => __importStar(require('./db'))).then(m => m.getUserByReferralCode(code));
            if (referrer)
                await (0, referral_1.notifyReferrer)(referrer.id, firstName);
        }
    }
    const premium = await (0, db_1.isPremium)(userId);
    const badge = premium ? ` ${(0, emoji_1.ce)('crown')}` : '';
    const trialNote = isNewRef ? `\n\n${(0, emoji_1.ce)('gift')} Тебе начислен 1 день Premium в подарок!` : '';
    await sendWelcome(chatId, WELCOME + badge + trialNote);
}
// ─── Main update handler ─────────────────────────────────────────────────────
async function handleUpdate(update) {
    // Pre-checkout
    if (update.pre_checkout_query) {
        await (0, premium_1.handlePreCheckout)(update.pre_checkout_query);
        return;
    }
    // Callback queries (inline keyboard buttons)
    if (update.callback_query) {
        const cq = update.callback_query;
        const userId = cq.from.id;
        const chatId = cq.message?.chat.id ?? userId;
        const data = cq.data ?? '';
        // Subscription gate: "I subscribed" button
        if (data === 'check_sub') {
            const ok = await (0, gate_1.isSubscribed)(userId, true);
            if (ok) {
                await (0, tg_1.answerCallback)(cq.id);
                await (0, db_1.getOrCreateUser)(userId, cq.from.first_name, cq.from.username);
                const code = pendingRef.get(userId);
                pendingRef.delete(userId);
                await startFlow(userId, chatId, cq.from.first_name, code ? `ref_${code}` : '');
            }
            else {
                await (0, tg_1.answerCallback)(cq.id, 'Ты ещё не подписался на канал', true);
                await (0, gate_1.sendGate)(chatId);
            }
            return;
        }
        await (0, tg_1.answerCallback)(cq.id);
        if (data === 'buy_monthly')
            await (0, premium_1.handleBuyMonthly)(userId, chatId);
        else if (data === 'buy_yearly')
            await (0, premium_1.handleBuyYearly)(userId, chatId);
        return;
    }
    const msg = update.message;
    if (!msg?.from)
        return;
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    // Register / update user on every message
    await (0, db_1.getOrCreateUser)(userId, msg.from.first_name, msg.from.username);
    // Successful payment
    if (msg.successful_payment) {
        await (0, premium_1.handleSuccessfulPayment)(msg);
        return;
    }
    const raw = (msg.text ?? '').trim();
    // ── Admin: dump custom_emoji_id of any premium emoji in the message ──────────
    if (tg_1.ADMIN_IDS.includes(userId)) {
        const ids = (msg.entities ?? [])
            .filter(e => e.type === 'custom_emoji' && e.custom_emoji_id)
            .map((e, i) => `${i + 1}. <code>${e.custom_emoji_id}</code> ${(msg.text ?? '').slice(e.offset, e.offset + e.length)}`);
        if (ids.length) {
            await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('book')} custom_emoji_id:\n${ids.join('\n')}`);
            return;
        }
    }
    if (!raw)
        return;
    // ── Mandatory subscription gate ──────────────────────────────────────────────
    if (!tg_1.ADMIN_IDS.includes(userId) && !(await (0, gate_1.isSubscribed)(userId))) {
        // Remember referral code so it can be credited once they subscribe
        if (raw.startsWith('/start')) {
            const p = raw.slice(6).trim();
            if (p.startsWith('ref_'))
                pendingRef.set(userId, p.slice(4));
        }
        await (0, gate_1.sendGate)(chatId);
        return;
    }
    const state = getState(userId);
    // ── /cancel ────────────────────────────────────────────────────────────────
    if (raw === '/cancel') {
        states.set(userId, { step: 'idle' });
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Отменено.`);
        return;
    }
    // ── /start ─────────────────────────────────────────────────────────────────
    if (raw.startsWith('/start')) {
        await startFlow(userId, chatId, msg.from.first_name, raw.slice(6).trim());
        return;
    }
    // ── /help ──────────────────────────────────────────────────────────────────
    if (raw === '/help') {
        await (0, tg_1.sendMessage)(chatId, HELP);
        return;
    }
    // ── /add ───────────────────────────────────────────────────────────────────
    if (raw === '/add') {
        const premium = await (0, db_1.isPremium)(userId);
        await (0, add_1.handleAddCommand)(userId, chatId, states, premium);
        return;
    }
    // ── /remove ────────────────────────────────────────────────────────────────
    if (raw === '/remove') {
        await (0, remove_1.handleRemoveCommand)(userId, chatId, states);
        return;
    }
    // ── /templates ─────────────────────────────────────────────────────────────
    if (raw === '/templates') {
        await (0, templates_1.handleTemplatesCommand)(userId, chatId, states);
        return;
    }
    // ── /save [name] ───────────────────────────────────────────────────────────
    if (raw.startsWith('/save')) {
        await (0, templates_1.handleSaveCommand)(userId, chatId, raw.slice(5).trim(), states);
        return;
    }
    // ── /apply [name] ──────────────────────────────────────────────────────────
    if (raw.startsWith('/apply')) {
        await (0, templates_1.handleApplyCommand)(userId, chatId, raw.slice(6).trim(), states);
        return;
    }
    // ── /del [name] ────────────────────────────────────────────────────────────
    if (raw.startsWith('/del')) {
        await (0, templates_1.handleDeleteTemplate)(userId, chatId, raw.slice(4).trim(), states);
        return;
    }
    // ── /premium ───────────────────────────────────────────────────────────────
    if (raw === '/premium') {
        await (0, premium_1.handlePremiumCommand)(userId, chatId);
        return;
    }
    if (raw === '/buy_monthly') {
        await (0, premium_1.handleBuyMonthly)(userId, chatId);
        return;
    }
    if (raw === '/buy_yearly') {
        await (0, premium_1.handleBuyYearly)(userId, chatId);
        return;
    }
    // ── /ref ───────────────────────────────────────────────────────────────────
    if (raw === '/ref') {
        await (0, referral_1.handleRefCommand)(userId, chatId);
        return;
    }
    // ── /schedule ──────────────────────────────────────────────────────────────
    if (raw === '/schedule') {
        await (0, schedule_1.handleScheduleCommand)(userId, chatId, states);
        return;
    }
    if (raw === '/queue') {
        await (0, schedule_1.handleQueueCommand)(userId, chatId);
        return;
    }
    if (raw.startsWith('/cancel_task')) {
        await (0, schedule_1.handleCancelTask)(userId, chatId, raw.slice(12).trim());
        return;
    }
    // ── /stats ─────────────────────────────────────────────────────────────────
    if (raw.startsWith('/stats')) {
        const arg = raw.slice(6).trim();
        // If arg looks like a post link
        if (arg.includes('t.me/')) {
            await (0, stats_1.handlePostStats)(userId, chatId, arg);
        }
        else {
            await (0, stats_1.handleStatsCommand)(userId, chatId, arg);
        }
        return;
    }
    // ── /admin ─────────────────────────────────────────────────────────────────
    if (raw === '/admin') {
        await (0, admin_1.handleAdminCommand)(userId, chatId);
        return;
    }
    if (raw.startsWith('/grant_premium')) {
        await (0, admin_1.handleGrantPremium)(userId, chatId, raw.slice(14).trim());
        return;
    }
    if (raw.startsWith('/broadcast')) {
        await (0, admin_1.handleBroadcast)(userId, chatId, raw.slice(10).trim(), states);
        return;
    }
    // ── State machine ──────────────────────────────────────────────────────────
    if (state.step === 'waiting_link_add') {
        await (0, add_1.handleLinkAdd)(userId, chatId, raw, states);
        return;
    }
    if (state.step === 'waiting_buttons') {
        await (0, add_1.handleButtonsInput)(userId, chatId, raw, state, states);
        return;
    }
    if (state.step === 'waiting_link_remove') {
        await (0, remove_1.handleLinkRemove)(userId, chatId, raw, states);
        return;
    }
    if (state.step === 'waiting_template_name_save') {
        await (0, templates_1.handleTemplateName)(userId, chatId, raw, states);
        return;
    }
    if (state.step === 'waiting_template_buttons_save') {
        await (0, templates_1.handleTemplateButtonsSave)(userId, chatId, raw, state.name, states);
        return;
    }
    if (state.step === 'waiting_template_apply_link') {
        await (0, templates_1.handleTemplateApplyLink)(userId, chatId, raw, state.templateName, states);
        return;
    }
    if (state.step === 'waiting_template_delete_name') {
        await (0, templates_1.handleTemplateDeleteName)(userId, chatId, raw, states);
        return;
    }
    if (state.step === 'waiting_schedule_link') {
        await (0, schedule_1.handleScheduleLink)(userId, chatId, raw, states);
        return;
    }
    if (state.step === 'waiting_schedule_buttons') {
        await (0, schedule_1.handleScheduleButtons)(userId, chatId, raw, state, states);
        return;
    }
    if (state.step === 'waiting_schedule_time') {
        await (0, schedule_1.handleScheduleTime)(userId, chatId, raw, state, states);
        return;
    }
    if (state.step === 'waiting_broadcast_text') {
        await (0, admin_1.handleBroadcastText)(userId, chatId, raw, states);
        return;
    }
    // ── Default ────────────────────────────────────────────────────────────────
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('bulb')} Напиши /add чтобы добавить кнопки к посту, или /help для справки.`);
}
