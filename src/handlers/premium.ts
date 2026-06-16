import { sendMessage, sendInvoice, answerPreCheckout, tg, BOT_USERNAME } from '../tg';
import { getUser, grantPremium, recordPayment, isPremium, PREMIUM_MAX_BUTTONS, PREMIUM_MAX_TEMPLATES } from '../db';
import { ce } from '../emoji';
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

  if (premium) {
    const until = user?.premium_until
      ? new Date(user.premium_until).toLocaleDateString('ru-RU')
      : null;
    await sendMessage(
      chatId,
      `${ce('crown')} <b>Add Button Premium</b>\n\n` +
        `Полный доступ открыт${until ? ` — до <b>${until}</b>` : ''}.\n` +
        `<i>Ни лимитов, ни границ. Канал звучит так, как ты задумал.</i>\n\n` +
        `${ce('handshake')} Хочешь дольше и бесплатно? Приглашай друзей — /ref`,
    );
    return;
  }

  await sendMessage(
    chatId,
    `${ce('gem')} <b>Add Button Premium</b>\n\n` +
      `<i>Каналы, на которые хочется подписаться, выглядят дорого.</i>\n` +
      `Premium даёт твоим постам именно такой вид.\n\n` +
      `${ce('bolt')} <b>Без лимитов</b> — публикуй и оформляй сколько нужно\n` +
      `${ce('puzzle')} <b>Меню и сетки</b> — до ${PREMIUM_MAX_BUTTONS} кнопок под постом\n` +
      `${ce('dividers')} <b>Шаблоны в один тап</b> — фирменный стиль за секунду\n` +
      `${ce('alarm')} <b>Кнопки по расписанию</b> — выходят точно вовремя\n\n` +
      `${ce('star')} <b>${PLANS.monthly.stars}</b> Stars / месяц — /buy_monthly\n` +
      `${ce('fire')} <b>${PLANS.yearly.stars}</b> Stars / год · выгода 45% — /buy_yearly\n\n` +
      `${ce('handshake')} Или получи Premium бесплатно — за друзей: /ref`,
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
    `Безлимитные кнопки, шаблоны и отложенные задачи на ${plan.label}.`,
    `${plan.key}_${userId}`,
    `Premium ${plan.label}`,
    plan.stars,
  );
}

// ── Pre-checkout handler ──────────────────────────────────────────────────────

export async function handlePreCheckout(query: TgPreCheckoutQuery): Promise<void> {
  if (query.currency !== 'XTR') {
    await answerPreCheckout(query.id, false, 'Неверная валюта');
    return;
  }

  const knownPlan = Object.values(PLANS).some(p => query.invoice_payload.startsWith(p.key));
  if (!knownPlan) {
    await answerPreCheckout(query.id, false, 'Неизвестный тариф');
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
    `${ce('crown')} <b>Premium активирован!</b>\n\n` +
      `Тариф: ${planLabel}\n` +
      `Действует до: ${until}\n\n` +
      `Что теперь доступно:\n` +
      `• Безлимитные применения кнопок\n` +
      `• До ${PREMIUM_MAX_BUTTONS} кнопок на пост\n` +
      `• До ${PREMIUM_MAX_TEMPLATES} шаблонов\n` +
      `• Отложенные кнопки: /schedule\n\n` +
      `Спасибо за поддержку! ${ce('gem')}`,
  );
}
