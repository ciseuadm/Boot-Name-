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
// Stars pricing
exports.PLANS = {
    monthly: { stars: 149, months: 1, label: '1 месяц', key: 'premium_monthly' },
    yearly: { stars: 990, months: 12, label: '12 месяцев (скидка 45%)', key: 'premium_yearly' },
};
// ── /premium command ─────────────────────────────────────────────────────────
async function handlePremiumCommand(userId, chatId) {
    const user = await (0, db_1.getUser)(userId);
    const premium = await (0, db_1.isPremium)(userId);
    const benefits = `${(0, emoji_1.ce)('gem')} <b>Add Button Premium</b>\n\n` +
        `Зачем он нужен и чем лучше бесплатной версии:\n\n` +
        `${(0, emoji_1.ce)('bolt')} <b>Без лимитов.</b> Добавляй кнопки к любому числу постов в день — на Free только ${db_1.FREE_DAILY_LIMIT} в сутки.\n` +
        `${(0, emoji_1.ce)('puzzle')} <b>Больше кнопок.</b> До ${db_1.PREMIUM_MAX_BUTTONS} кнопок под постом вместо ${db_1.FREE_MAX_BUTTONS} — целые меню и сетки.\n` +
        `${(0, emoji_1.ce)('dividers')} <b>Больше шаблонов.</b> До ${db_1.PREMIUM_MAX_TEMPLATES} сохранённых наборов кнопок вместо ${db_1.FREE_MAX_TEMPLATES} — оформляй посты в один клик.\n` +
        `${(0, emoji_1.ce)('alarm')} <b>Отложенные кнопки.</b> Запланируй появление кнопок на нужное время — /schedule (только в Premium).\n` +
        `${(0, emoji_1.ce)('rocket')} <b>Приоритет.</b> Поддержка новых возможностей в первую очередь.\n`;
    if (premium) {
        const until = user?.premium_until
            ? ` до <b>${new Date(user.premium_until).toLocaleDateString('ru-RU')}</b>`
            : ' (бессрочно)';
        await (0, tg_1.sendMessage)(chatId, benefits +
            `\n${(0, emoji_1.ce)('crown')} <b>Premium активен</b>${until} — все возможности уже у тебя.\n\n` +
            `${(0, emoji_1.ce)('handshake')} Продлить бесплатно можно через рефералов: /ref`);
        return;
    }
    await (0, tg_1.sendMessage)(chatId, benefits +
        `\n${(0, emoji_1.ce)('star')} <b>Сейчас у тебя Free</b> — ${db_1.FREE_DAILY_LIMIT} постов/сутки, до ${db_1.FREE_MAX_BUTTONS} кнопок, ${db_1.FREE_MAX_TEMPLATES} шаблона.\n\n` +
        `<b>Подключить Premium</b> (оплата Telegram Stars, прямо в Telegram):\n` +
        `${(0, emoji_1.ce)('star')} /buy_monthly — <b>${exports.PLANS.monthly.stars} Stars / месяц</b>\n` +
        `${(0, emoji_1.ce)('fire')} /buy_yearly — <b>${exports.PLANS.yearly.stars} Stars / год</b> (экономия 45%)\n\n` +
        `${(0, emoji_1.ce)('handshake')} Или получи Premium бесплатно за приглашённых друзей: /ref`);
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
