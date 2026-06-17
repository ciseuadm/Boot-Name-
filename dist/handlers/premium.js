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
const PREMIUM_AVATAR_URL = tg_1.WEBHOOK_URL ? `${tg_1.WEBHOOK_URL}/premium.png` : '';
async function sendPremiumMessage(chatId, text) {
    if (PREMIUM_AVATAR_URL) {
        try {
            await (0, tg_1.sendPhoto)(chatId, PREMIUM_AVATAR_URL, text);
            return;
        }
        catch {
            // Fall back to plain text if photo delivery fails
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
    if (premium) {
        const until = user?.premium_until
            ? new Date(user.premium_until).toLocaleDateString('ru-RU')
            : null;
        await sendPremiumMessage(chatId, `${(0, emoji_1.ce)('crown')} <b>Add Button Premium</b>\n\n` +
            `Полный доступ открыт${until ? ` — до <b>${until}</b>` : ''}.\n` +
            `<i>Ни лимитов, ни границ. Канал звучит так, как ты задумал.</i>\n\n` +
            `${(0, emoji_1.ce)('handshake')} Хочешь дольше и бесплатно? Приглашай друзей — /ref`);
        return;
    }
    await sendPremiumMessage(chatId, `${(0, emoji_1.ce)('gem')} <b>Add Button Premium</b>\n\n` +
        `<i>Каналы, на которые хочется подписаться, выглядят дорого.</i>\n` +
        `Premium даёт твоим постам именно такой вид.\n\n` +
        `${(0, emoji_1.ce)('bolt')} <b>Без лимитов</b> — публикуй и оформляй сколько нужно\n` +
        `${(0, emoji_1.ce)('puzzle')} <b>Меню и сетки</b> — до ${db_1.PREMIUM_MAX_BUTTONS} кнопок под постом\n` +
        `${(0, emoji_1.ce)('dividers')} <b>Шаблоны в один тап</b> — фирменный стиль за секунду\n` +
        `${(0, emoji_1.ce)('alarm')} <b>Кнопки по расписанию</b> — выходят точно вовремя\n\n` +
        `${(0, emoji_1.ce)('star')} <b>${exports.PLANS.monthly.stars}</b> Stars / месяц — /buy_monthly\n` +
        `${(0, emoji_1.ce)('fire')} <b>${exports.PLANS.yearly.stars}</b> Stars / год · выгода 45% — /buy_yearly\n\n` +
        `${(0, emoji_1.ce)('handshake')} Или получи Premium бесплатно — за друзей: /ref`);
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
