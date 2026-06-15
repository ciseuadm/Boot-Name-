import { sendMessage, getChatMember, ADMIN_IDS } from '../tg';
import { ce } from '../emoji';

// ─── Mandatory subscription gate ─────────────────────────────────────────────
//
// Users must be subscribed to REQUIRED_CHANNEL before they can use the bot.
// IMPORTANT: the bot MUST be added as an administrator of that channel,
// otherwise Telegram won't allow getChatMember to read membership.

// Username form (e.g. @cyber_mind_best) used for the getChatMember API call.
export const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL ?? '@cyber_mind_best';
// Public link shown to the user on the "Subscribe" button.
export const CHANNEL_URL =
  process.env.REQUIRED_CHANNEL_URL ??
  `https://t.me/${REQUIRED_CHANNEL.replace(/^@/, '')}`;

export function gateEnabled(): boolean {
  return REQUIRED_CHANNEL.trim().length > 0;
}

// Short-lived cache of verified users to avoid hammering getChatMember.
const verifiedUntil = new Map<number, number>();
const VERIFY_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Checks whether the user is subscribed to the required channel.
 * @param force skip the positive cache and always hit the Telegram API.
 */
export async function isSubscribed(userId: number, force = false): Promise<boolean> {
  if (!gateEnabled()) return true;
  if (ADMIN_IDS.includes(userId)) return true;

  if (!force) {
    const until = verifiedUntil.get(userId);
    if (until && until > Date.now()) return true;
  }

  try {
    const member = await getChatMember(REQUIRED_CHANNEL, userId);
    const ok =
      member.status === 'creator' ||
      member.status === 'administrator' ||
      member.status === 'member' ||
      (member.status === 'restricted' && member.is_member === true);

    if (ok) {
      verifiedUntil.set(userId, Date.now() + VERIFY_TTL_MS);
    } else {
      verifiedUntil.delete(userId);
    }
    return ok;
  } catch (e) {
    const msg = (e as Error).message ?? '';
    // If the bot can't read the channel's members it is almost certainly not an
    // admin there. Fail open (don't brick the bot) but log loudly so the owner
    // can fix the setup. Definitive "not a participant" errors mean not subscribed.
    if (
      /chat not found|administrator|member list is inaccessible|CHAT_ADMIN_REQUIRED/i.test(msg)
    ) {
      console.warn(
        `[gate] Cannot verify subscription for ${REQUIRED_CHANNEL}: "${msg}". ` +
          `Add the bot as an ADMIN of the channel to enforce the gate.`,
      );
      return true;
    }
    return false;
  }
}

/** Sends the "subscribe first" gate message with action buttons. */
export async function sendGate(chatId: number): Promise<void> {
  const text =
    `${ce('lock')} <b>Почти готово!</b>\n\n` +
    `Чтобы пользоваться ботом, подпишись на наш канал — это обязательное условие.\n\n` +
    `${ce('megaphone')} Подпишись по кнопке ниже, затем нажми «Я подписался» ${ce('check')}`;

  await sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📣 Подписаться на канал', url: CHANNEL_URL }],
        [{ text: '✅ Я подписался', callback_data: 'check_sub' }],
      ],
    },
  });
}
