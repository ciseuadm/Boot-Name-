import { sendMessage, BOT_USERNAME } from '../tg';
import { getUser, getUserByReferralCode, recordReferral, grantPremiumDays, isPremium } from '../db';

// Called on /start ref_CODE — register referral for new user
export async function processReferral(newUserId: number, code: string): Promise<void> {
  const referrer = await getUserByReferralCode(code);
  if (!referrer || referrer.id === newUserId) return;

  const newUser = await getUser(newUserId);
  if (newUser?.referred_by) return; // already referred

  await recordReferral(newUserId, referrer.id);
  // New user gets 1 day free trial
  await grantPremiumDays(newUserId, 1);
}

// /ref command
export async function handleRefCommand(userId: number, chatId: number): Promise<void> {
  const user = await getUser(userId);
  if (!user) return;

  const link = `https://t.me/${BOT_USERNAME}?start=ref_${user.referral_code}`;
  const count = user.referral_count;
  const nextBonus = 3 - (count % 3);
  const premium = await isPremium(userId);

  await sendMessage(
    chatId,
    `🤝 <b>Реферальная программа</b>\n\n` +
      `Твоя ссылка:\n<code>${link}</code>\n\n` +
      `Как работает:\n` +
      `• Друг переходит по твоей ссылке и получает <b>1 день Premium бесплатно</b>\n` +
      `• Ты получаешь <b>+1 день Premium</b> за каждого\n` +
      `• Каждые 3 реферала = <b>+5 дней Premium</b> бонусом\n\n` +
      `📊 Твоя статистика:\n` +
      `Рефералов: <b>${count}</b>\n` +
      `До следующего бонуса (+5 дней): <b>${nextBonus}</b>\n` +
      (premium ? '' : '\n💡 Начни делиться ссылкой прямо сейчас!'),
  );
}

// Called after successful referral — notify referrer
export async function notifyReferrer(referrerId: number, newUserName: string): Promise<void> {
  const referrer = await getUser(referrerId);
  if (!referrer) return;

  const { sendMessage: send } = await import('../tg');
  const count = referrer.referral_count;
  const bonusMsg = count % 3 === 0 ? '\n🎁 Бонус: <b>+5 дней Premium</b> за 3 реферала!' : '';

  await send(
    referrerId,
    `🎉 По твоей реферальной ссылке зарегистрировался новый пользователь!\n` +
      `Ты получил <b>+1 день Premium</b>.${bonusMsg}\n\n` +
      `Всего рефералов: ${count}`,
  ).catch(() => {});
}
