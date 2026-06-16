import { sendMessage, BOT_USERNAME } from '../tg';
import { getUser, getUserByReferralCode, recordReferral, grantPremiumDays, isPremium } from '../db';
import { ce } from '../emoji';

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
  const premium = await isPremium(userId);

  await sendMessage(
    chatId,
    `${ce('handshake')} <b>Реферальная программа</b>\n\n` +
      `Твоя ссылка:\n<code>${link}</code>\n\n` +
      `Как работает:\n` +
      `${ce('gift')} Друг переходит по твоей ссылке и получает <b>1 день Premium бесплатно</b>\n` +
      `${ce('star')} Ты получаешь <b>+1 день Premium</b> за каждого\n` +
      `${ce('fire')} Каждые 3 реферала = <b>+5 дней Premium</b> бонусом\n\n` +
      `${ce('chart')} Твоя статистика:\n` +
      `${ce('people')} Рефералов: <b>${count}</b>\n` +
      (premium ? '' : `\n${ce('bulb')} Начни делиться ссылкой прямо сейчас!`),
  );
}

// Called after successful referral — notify referrer
export async function notifyReferrer(referrerId: number, newUserId: number): Promise<void> {
  const referrer = await getUser(referrerId);
  if (!referrer) return;

  const { sendMessage: send } = await import('../tg');
  const count = referrer.referral_count;
  const bonusMsg = count % 3 === 0 ? `\n${ce('fire')} Бонус: <b>+5 дней Premium</b> за 3 реферала!` : '';
  const newUser = await getUser(newUserId);
  const href = newUser?.username
    ? `https://t.me/${newUser.username}`
    : `tg://user?id=${newUserId}`;
  const userLink = `<a href="${href}">новый</a>`;

  await send(
    referrerId,
    `${ce('gift')} По твоей реферальной ссылке зарегистрировался ${userLink} пользователь!\n` +
      `Ты получил <b>+1 день Premium</b>.${bonusMsg}\n\n` +
      `Всего рефералов: ${count}`,
  ).catch(() => {});
}
