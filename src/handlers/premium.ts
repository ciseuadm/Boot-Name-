import { sendMessage, sendInvoice, answerPreCheckout, tg, BOT_USERNAME } from '../tg';
import { getUser, grantPremium, recordPayment, isPremium, FREE_DAILY_LIMIT, FREE_MAX_BUTTONS, FREE_MAX_TEMPLATES, PREMIUM_MAX_BUTTONS, PREMIUM_MAX_TEMPLATES } from '../db';
import type { TgPreCheckoutQuery, TgMessage } from '../tg';

// Stars pricing
export const PLANS = {
  monthly: { stars: 149, months: 1,  label: '1 месяц',  key: 'premium_monthly' },
  yearly:  { stars: 990, months: 12, label: '12 месяцев (скидка 45%)', key: 'premium_yearly' },
} as const;

// ── /premium command ─────────────────────────────────────────────────────────

export async function handlePremiumCommand(userId: number, chatId: number): Promise<void> {
  const user = await getUser(userId);
  const premium = await isPremium(userId);

  const statusLine = premium
    ? `✅ <b>Premium активен</b>` +
      (user?.premium_until
        ? ` до ${new Date(user.premium_until).toLocaleDateString('ru-RU')}`
        : ' (бессрочно)')
    : `📦 Тариф: <b>Free</b>`;

  const freeNote = premium
    ? ''
    : `\n<b>Free:</b> ${FREE_DAILY_LIMIT} постов/сутки · ${FREE_MAX_BUTTONS} кнопок · ${FREE_MAX_TEMPLATES} шаблона\n` +
      `<b>Premium:</b> безлимит · ${PREMIUM_MAX_BUTTONS} кнопок · ${PREMIUM_MAX_TEMPLATES} шаблонов · отложенные кнопки · аналитика кликов\n`;

  await sendMessage(
    chatId,
    `⭐ <b>Add Button Premium</b>\n\n${statusLine}\n${freeNote}\n` +
      `Оплата — Telegram Stars (покупаются прямо в Telegram):\n\n` +
      `• /buy_monthly — <b>${PLANS.monthly.stars} Stars / месяц</b>\n` +
      `• /buy_yearly — <b>${PLANS.yearly.stars} Stars / год</b> (экономия 45%)\n\n` +
      `⭐ Реферальная программа — бесплатный Premium: /ref`,
  );
}

// ── /buy_monthly / /buy_yearly ────────────────────────────────────────────────

export async function handleBuyMonthly(userId: number, chatId: number): Promise<void> {
  await sendPlanInvoice(chatId, userId, 'monthly');
}

export async function handleBuyYearly(userId: number, chatId: number): Promise<void> {
  await sendPlanInvoice(chatId, userId, 'yearly');
}

async function sendPlanInvoice(
  chatId: number,
  userId: number,
  planKey: keyof typeof PLANS,
): Promise<void> {
  const plan = PLANS[planKey];
  await sendInvoice(
    chatId,
    `Add Button Premium — ${plan.label}`,
    `Безлимитные кнопки, шаблоны, отложенные задачи и аналитика кликов на ${plan.label}.`,
    `${plan.key}_${userId}`,
    `Premium ${plan.label}`,
    plan.stars,
  );
}

// ── Pre-checkout handler ──────────────────────────────────────────────────────

export async function handlePreCheckout(query: TgPreCheckoutQuery): Promise<void> {
  const validPayloads = Object.values(PLANS).map(p => `${p.key}_${query.from.id}`);
  const isValid = validPayloads.some(p => query.invoice_payload.startsWith(p.replace(`_${query.from.id}`, '')));

  if (query.currency !== 'XTR') {
    await answerPreCheckout(query.id, false, 'Неверная валюта');
    return;
  }
  await answerPreCheckout(query.id, true);
}

// ── Successful payment handler ────────────────────────────────────────────────

export async function handleSuccessfulPayment(msg: TgMessage): Promise<void> {
  const payment = msg.successful_payment!;
  const userId = msg.from!.id;
  const chatId = msg.chat.id;

  const payload = payment.invoice_payload;
  let months = 1;
  let planLabel = '1 месяц';

  if (payload.startsWith('premium_yearly')) {
    months = 12;
    planLabel = '12 месяцев';
  } else if (payload.startsWith('premium_monthly')) {
    months = 1;
    planLabel = '1 месяц';
  }

  await grantPremium(userId, months);
  await recordPayment(
    userId,
    payment.telegram_payment_charge_id,
    payment.total_amount,
    payload.split('_').slice(0, 2).join('_'),
    months,
  );

  const user = await getUser(userId);
  const until = user?.premium_until
    ? new Date(user.premium_until).toLocaleDateString('ru-RU')
    : '?';

  await sendMessage(
    chatId,
    `🎉 <b>Premium активирован!</b>\n\n` +
      `Тариф: ${planLabel}\n` +
      `Действует до: ${until}\n\n` +
      `Что теперь доступно:\n` +
      `• Безлимитные применения кнопок\n` +
      `• До ${PREMIUM_MAX_BUTTONS} кнопок на пост\n` +
      `• До ${PREMIUM_MAX_TEMPLATES} шаблонов\n` +
      `• Отложенные кнопки: /schedule\n` +
      `• Аналитика кликов: /stats on\n\n` +
      `Спасибо за поддержку! ⭐`,
  );
}
