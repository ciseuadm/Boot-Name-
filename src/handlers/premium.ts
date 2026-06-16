import { sendMessage, sendInvoice, answerPreCheckout, tg, BOT_USERNAME } from '../tg';
import { getUser, grantPremium, recordPayment, isPremium, FREE_DAILY_LIMIT, FREE_MAX_BUTTONS, FREE_MAX_TEMPLATES, PREMIUM_MAX_BUTTONS, PREMIUM_MAX_TEMPLATES } from '../db';
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

  const benefits =
    `${ce('gem')} <b>Add Button Premium</b>\n\n` +
    `Зачем он нужен и чем лучше бесплатной версии:\n\n` +
    `${ce('bolt')} <b>Без лимитов.</b> Добавляй кнопки к любому числу постов в день — на Free только ${FREE_DAILY_LIMIT} в сутки.\n` +
    `${ce('puzzle')} <b>Больше кнопок.</b> До ${PREMIUM_MAX_BUTTONS} кнопок под постом вместо ${FREE_MAX_BUTTONS} — целые меню и сетки.\n` +
    `${ce('dividers')} <b>Больше шаблонов.</b> До ${PREMIUM_MAX_TEMPLATES} сохранённых наборов кнопок вместо ${FREE_MAX_TEMPLATES} — оформляй посты в один клик.\n` +
    `${ce('alarm')} <b>Отложенные кнопки.</b> Запланируй появление кнопок на нужное время — /schedule (только в Premium).\n` +
    `${ce('rocket')} <b>Приоритет.</b> Поддержка новых возможностей в первую очередь.\n`;

  if (premium) {
    const until = user?.premium_until
      ? ` до <b>${new Date(user.premium_until).toLocaleDateString('ru-RU')}</b>`
      : ' (бессрочно)';
    await sendMessage(
      chatId,
      benefits +
        `\n${ce('crown')} <b>Premium активен</b>${until} — все возможности уже у тебя.\n\n` +
        `${ce('handshake')} Продлить бесплатно можно через рефералов: /ref`,
    );
    return;
  }

  await sendMessage(
    chatId,
    benefits +
      `\n${ce('star')} <b>Сейчас у тебя Free</b> — ${FREE_DAILY_LIMIT} постов/сутки, до ${FREE_MAX_BUTTONS} кнопок, ${FREE_MAX_TEMPLATES} шаблона.\n\n` +
      `<b>Подключить Premium</b> (оплата Telegram Stars, прямо в Telegram):\n` +
      `${ce('star')} /buy_monthly — <b>${PLANS.monthly.stars} Stars / месяц</b>\n` +
      `${ce('fire')} /buy_yearly — <b>${PLANS.yearly.stars} Stars / год</b> (экономия 45%)\n\n` +
      `${ce('handshake')} Или получи Premium бесплатно за приглашённых друзей: /ref`,
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
