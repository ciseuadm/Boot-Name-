"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLANS = void 0;
exports.handlePremiumCommand = handlePremiumCommand;
exports.handleBuyMonthly = handleBuyMonthly;
exports.handleBuyYearly = handleBuyYearly;
exports.handlePreCheckout = handlePreCheckout;
exports.handleSuccessfulPayment = handleSuccessfulPayment;
const tg_1 = require("../tg");
const db_1 = require("../db");
const emoji_1 = require("../emoji");
// Distinct path from the old square /premium.png — Telegram caches photos by URL.
// Bump the version query whenever the banner art changes so Telegram refetches it.
const PREMIUM_BANNER_URL = tg_1.WEBHOOK_URL ? `${tg_1.WEBHOOK_URL}/premium-banner.png?v=5` : '';
// Telegram counts a photo caption by its VISIBLE length (HTML tags and custom
// emoji markup don't count). Keep a little headroom under the 1024 hard limit.
const CAPTION_SAFE_LIMIT = 1000;
function visibleLength(html) {
    return html.replace(/<[^>]+>/g, '').length;
}
/**
 * Sends the premium pitch as ONE post: the banner with the whole text in its
 * caption. This keeps the bot commands clickable and the dynamic "active until"
 * line intact — neither is possible if the text were baked into the image.
 * Falls back to banner + separate message only if the caption is too long.
 */
async function sendPremiumMessage(chatId, text) {
    if (PREMIUM_BANNER_URL) {
        try {
            if (visibleLength(text) <= CAPTION_SAFE_LIMIT) {
                await (0, tg_1.sendPhoto)(chatId, PREMIUM_BANNER_URL, text);
            }
            else {
                await (0, tg_1.sendPhoto)(chatId, PREMIUM_BANNER_URL, `${(0, emoji_1.ce)('gem')} <b>Add Button Premium</b>`);
                await (0, tg_1.sendMessage)(chatId, text);
            }
            return;
        }
        catch (e) {
            console.error('premium sendPhoto failed:', e);
        }
    }
    await (0, tg_1.sendMessage)(chatId, text);
}
// Stars pricing
exports.PLANS = {
    monthly: { stars: 149, months: 1, label: '1 месяц', key: 'premium_monthly' },
    yearly: { stars: 990, months: 12, label: '12 месяцев (скидка 45%)', key: 'premium_yearly' },
};
// ── /premium command ─────────────────────────────────────────────────────────
async function handlePremiumCommand(userId, chatId) {
    const user = await (0, db_1.getUser)(userId);
    const premium = await (0, db_1.isPremium)(userId);
    const activeLine = premium && user?.premium_until
        ? `${(0, emoji_1.ce)('crown')} Premium активен до <b>${new Date(user.premium_until).toLocaleDateString('ru-RU')}</b>\n\n`
        : '';
    const text = `${(0, emoji_1.ce)('gem')} <b>Add Button Premium</b>\n\n` +
        activeLine +
        `<i>Каналы, на которые хочется подписаться, выглядят дорого.</i>\n` +
        `Premium даёт твоим постам именно такой вид.\n\n` +
        `${(0, emoji_1.ce)('bolt')} <b>Без лимитов</b> — публикуй и оформляй сколько нужно\n` +
        `${(0, emoji_1.ce)('puzzle')} <b>Меню и сетки</b> — до ${db_1.PREMIUM_MAX_BUTTONS} кнопок под постом\n` +
        `${(0, emoji_1.ce)('dividers')} <b>Шаблоны в один тап</b> — фирменный стиль за секунду\n` +
        `${(0, emoji_1.ce)('alarm')} <b>Кнопки по расписанию</b> — выходят точно вовремя\n\n` +
        `${(0, emoji_1.ce)('star')} <b>${exports.PLANS.monthly.stars}</b> Stars / месяц — /buy_monthly\n` +
        `${(0, emoji_1.ce)('fire')} <b>${exports.PLANS.yearly.stars}</b> Stars / год · выгода 45% — /buy_yearly\n\n` +
        `${(0, emoji_1.ce)('handshake')} Или получи Premium бесплатно — за друзей: /ref`;
    await sendPremiumMessage(chatId, text);
}
// ── /buy_monthly / /buy_yearly ────────────────────────────────────────────────
async function handleBuyMonthly(userId, chatId) {
    await sendPlanInvoice(chatId, userId, 'monthly');
}
async function handleBuyYearly(userId, chatId) {
    await sendPlanInvoice(chatId, userId, 'yearly');
}
async function sendPlanInvoice(chatId, userId, planKey) {
    const plan = exports.PLANS[planKey];
    await (0, tg_1.sendInvoice)(chatId, `Add Button Premium — ${plan.label}`, `Безлимитные кнопки, шаблоны и отложенные задачи на ${plan.label}.`, `${plan.key}_${userId}`, `Premium ${plan.label}`, plan.stars);
}
// ── Pre-checkout handler ──────────────────────────────────────────────────────
async function handlePreCheckout(query) {
    if (query.currency !== 'XTR') {
        await (0, tg_1.answerPreCheckout)(query.id, false, 'Неверная валюта');
        return;
    }
    const knownPlan = Object.values(exports.PLANS).some(p => query.invoice_payload.startsWith(p.key));
    if (!knownPlan) {
        await (0, tg_1.answerPreCheckout)(query.id, false, 'Неизвестный тариф');
        return;
    }
    await (0, tg_1.answerPreCheckout)(query.id, true);
}
// ── Successful payment handler ────────────────────────────────────────────────
async function handleSuccessfulPayment(msg) {
    const payment = msg.successful_payment;
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const payload = payment.invoice_payload;
    let months = 1;
    let planLabel = '1 месяц';
    if (payload.startsWith('premium_yearly')) {
        months = 12;
        planLabel = '12 месяцев';
    }
    else if (payload.startsWith('premium_monthly')) {
        months = 1;
        planLabel = '1 месяц';
    }
    await (0, db_1.grantPremium)(userId, months);
    await (0, db_1.recordPayment)(userId, payment.telegram_payment_charge_id, payment.total_amount, payload.split('_').slice(0, 2).join('_'), months);
    const user = await (0, db_1.getUser)(userId);
    const until = user?.premium_until
        ? new Date(user.premium_until).toLocaleDateString('ru-RU')
        : '?';
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('crown')} <b>Premium активирован!</b>\n\n` +
        `Тариф: ${planLabel}\n` +
        `Действует до: ${until}\n\n` +
        `Что теперь доступно:\n` +
        `• Безлимитные применения кнопок\n` +
        `• До ${db_1.PREMIUM_MAX_BUTTONS} кнопок на пост\n` +
        `• До ${db_1.PREMIUM_MAX_TEMPLATES} шаблонов\n` +
        `• Отложенные кнопки: /schedule\n\n` +
        `Спасибо за поддержку! ${(0, emoji_1.ce)('gem')}`);
}
