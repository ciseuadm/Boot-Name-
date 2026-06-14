import { sendMessage, BOT_USERNAME } from '../tg';
import { getUser, getUserByReferralCode, recordReferral, grantPremium, isPremium } from '../db';

// Called on /start ref_CODE — register referral for new user
export async function processReferral(newUserId: number, code: string): Promise<void> {
  const referrer = await getUserByReferralCode(code);
  if (!referrer || referrer.id === newUserId) return;

  const newUser = await getUser(newUserId);
  if (newUser?.referred_by) return; // already referred

  await recordReferral(newUserId, referrer.id);
  // New user gets 3 days free trial
  await grantPremiumDays(newUserId, 3);
}

async function grantPremiumDays(userId: number, days: number): Promise<void> {
  const { pool } = await import('../db');
  await pool.query(
    `UPDATE users SET
       plan = 'premium',
       premium_until = GREATEST(COALESCE(premium_until, NOW()), NOW()) + ($2 * INTERVAL '1 day')
     WHERE id = $1`,
    [userId, days],
  );
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
      `• Друг переходит по твоей ссылке и получает <b>3 дня Premium бесплатно</b>\n` +
      `• Ты получаешь <b>+7 дней Premium</b> за каждого\n` +
      `• Каждые 3 реферала = <b>+1 месяц Premium</b>\n\n` +
      `📊 Твоя статистика:\n` +
      `Рефералов: <b>${count}</b>\n` +
      `До следующего бонусного месяца: <b>${nextBonus}</b> реферала\n` +
      (premium ? '' : '\n💡 Начни делиться ссылкой прямо сейчас!'),
  );
}

// Called after successful referral — notify referrer
export async function notifyReferrer(referrerId: number, newUserName: string): Promise<void> {
  const referrer = await getUser(referrerId);
  if (!referrer) return;

  const { sendMessage: send } = await import('../tg');
  const count = referrer.referral_count;
  const bonusMsg = count % 3 === 0 ? '\n🎁 Бонус: <b>+1 месяц Premium</b> за 3 реферала!' : '';

  await send(
    referrerId,
    `🎉 По твоей реферальной ссылке зарегистрировался новый пользователь!\n` +
      `Ты получил <b>+7 дней Premium</b>.${bonusMsg}\n\n` +
      `Всего рефералов: ${count}`,
  ).catch(() => {});
}
