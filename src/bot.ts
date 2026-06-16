import { sendMessage, sendPhoto, answerCallback, WEBHOOK_URL, ADMIN_IDS, TgUpdate, TgMessage } from './tg';
import { ce } from './emoji';
import { getOrCreateUser, isPremium } from './db';
import { isSubscribed, sendGate } from './handlers/gate';
import { BUTTON_FORMAT_HELP, handleAddCommand, handleLinkAdd, handleButtonsInput } from './handlers/add';
import { handleRemoveCommand, handleLinkRemove } from './handlers/remove';
import {
  handleTemplatesCommand,
  handleSaveCommand,
  handleApplyCommand,
  handleDeleteTemplate,
  handleTemplateName,
  handleTemplateButtonsSave,
  handleTemplateApplyLink,
  handleTemplateDeleteName,
} from './handlers/templates';
import {
  handlePremiumCommand,
  handleBuyMonthly,
  handleBuyYearly,
  handlePreCheckout,
  handleSuccessfulPayment,
} from './handlers/premium';
import { handleRefCommand, processReferral, notifyReferrer } from './handlers/referral';
import {
  handleScheduleCommand,
  handleQueueCommand,
  handleCancelTask,
  handleScheduleLink,
  handleScheduleButtons,
  handleScheduleTime,
} from './handlers/schedule';
import { handleStatsCommand, handlePostStats } from './handlers/stats';
import {
  handleAdminCommand,
  handleGrantPremium,
  handleBroadcast,
  handleBroadcastText,
} from './handlers/admin';

// ─── State machine ──────────────────────────────────────────────────────────

export type UserState =
  | { step: 'idle' }
  | { step: 'waiting_link_add' }
  | { step: 'waiting_buttons'; chatId: string | number; messageId: number; tracking: boolean }
  | { step: 'waiting_link_remove' }
  | { step: 'waiting_template_name_save' }
  | { step: 'waiting_template_buttons_save'; name: string }
  | { step: 'waiting_template_apply_link'; templateName: string }
  | { step: 'waiting_template_delete_name' }
  | { step: 'waiting_schedule_link' }
  | { step: 'waiting_schedule_buttons'; chatId: string | number; messageId: number }
  | { step: 'waiting_schedule_time'; chatId: string | number; messageId: number; buttonsText: string }
  | { step: 'waiting_broadcast_text' };

const states = new Map<number, UserState>();

function getState(userId: number): UserState {
  return states.get(userId) ?? { step: 'idle' };
}

// ─── Start message ──────────────────────────────────────────────────────────

// Short, attractive caption shown with the avatar on /start
const WELCOME = `${ce('check')} <b>Add Button Bot</b>

Добавляю, меняю и удаляю кнопки под любым постом канала — <b>пост остаётся нетронутым</b>.

${ce('ninja')} Без пометки «изменено» — пост не меняется
${ce('noentry')} Без рекламных подписей, как у Postbot
${ce('star')} С премиум-эмодзи в постах
${ce('bolt')} Кнопки появляются за пару секунд
${ce('chart')} Аналитика кликов · ${ce('alarm')} отложенный постинг

<b>Старт за 3 шага:</b>
${ce('num1')} Добавь меня в админы канала
${ce('num2')} Включи право «Редактировать сообщения»
${ce('num3')} Жми /add ${ce('rocket')}

Все команды — /help`;

// Full command reference shown on /help
const HELP = `${ce('check')}  <b>Add Button Bot</b>

Добавляю, меняю и удаляю кнопки под постами канала — без пометки «изменено» и без рекламных подписей на постах.

<b>Команды:</b>

${ce('plus')} /add — добавить кнопки к посту
${ce('trash')} /remove — удалить кнопки с поста
${ce('dividers')} /templates — шаблоны кнопок
${ce('alarm')} /schedule — отложить добавление
${ce('chartup')} /stats — аналитика кликов
${ce('gem')} /premium — тариф и подписка
${ce('handshake')} /ref — реферальная программа

${ce('star')} /schedule и /stats доступны в Premium

<b>${ce('bulb')} Как начать:</b>

Добавь меня в администраторы своего канала
Выдай право «Редактировать сообщения»
Отправь /add и следуй инструкции`;

const BANNER_URL = WEBHOOK_URL ? `${WEBHOOK_URL}/banner.png` : '';

async function sendWelcome(chatId: number, caption: string): Promise<void> {
  if (BANNER_URL) {
    try {
      await sendPhoto(chatId, BANNER_URL, caption);
      return;
    } catch {
      // Fall back to plain text if photo delivery fails
    }
  }
  await sendMessage(chatId, caption);
}

// Referral codes captured from /start while the user was still behind the gate,
// applied once they pass the subscription check.
const pendingRef = new Map<number, string>();

/** Runs the /start welcome flow, optionally crediting a referral code. */
async function startFlow(
  userId: number,
  chatId: number,
  firstName: string,
  param: string,
): Promise<void> {
  states.set(userId, { step: 'idle' });

  let isNewRef = false;
  if (param.startsWith('ref_')) {
    const code = param.slice(4);
    const user = await import('./db').then(m => m.getUser(userId));
    if (!user?.referred_by) {
      isNewRef = true;
      await processReferral(userId, code);
      const referrer = await import('./db').then(m => m.getUserByReferralCode(code));
      if (referrer) await notifyReferrer(referrer.id, firstName);
    }
  }

  const premium = await isPremium(userId);
  const badge = premium ? ` ${ce('crown')}` : '';
  const trialNote = isNewRef ? `\n\n${ce('gift')} Тебе начислен 1 день Premium в подарок!` : '';

  await sendWelcome(chatId, WELCOME + badge + trialNote);
}

// ─── Main update handler ─────────────────────────────────────────────────────

export async function handleUpdate(update: TgUpdate): Promise<void> {
  // Pre-checkout
  if (update.pre_checkout_query) {
    await handlePreCheckout(update.pre_checkout_query);
    return;
  }

  // Callback queries (inline keyboard buttons)
  if (update.callback_query) {
    const cq = update.callback_query;
    const userId = cq.from.id;
    const chatId = cq.message?.chat.id ?? userId;
    const data = cq.data ?? '';

    // Subscription gate: "I subscribed" button
    if (data === 'check_sub') {
      const ok = await isSubscribed(userId, true);
      if (ok) {
        await answerCallback(cq.id);
        await getOrCreateUser(userId, cq.from.first_name, cq.from.username);
        const code = pendingRef.get(userId);
        pendingRef.delete(userId);
        await startFlow(userId, chatId, cq.from.first_name, code ? `ref_${code}` : '');
      } else {
        await answerCallback(cq.id, 'Ты ещё не подписался на канал', true);
        await sendGate(chatId);
      }
      return;
    }

    await answerCallback(cq.id);
    if (data === 'buy_monthly') await handleBuyMonthly(userId, chatId);
    else if (data === 'buy_yearly') await handleBuyYearly(userId, chatId);
    return;
  }

  const msg = update.message;
  if (!msg?.from) return;

  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // Register / update user on every message
  await getOrCreateUser(userId, msg.from.first_name, msg.from.username);

  // Successful payment
  if (msg.successful_payment) {
    await handleSuccessfulPayment(msg);
    return;
  }

  const raw = (msg.text ?? '').trim();

  // ── Admin: dump custom_emoji_id of any premium emoji in the message ──────────
  if (ADMIN_IDS.includes(userId)) {
    const ids = (msg.entities ?? [])
      .filter(e => e.type === 'custom_emoji' && e.custom_emoji_id)
      .map((e, i) => `${i + 1}. <code>${e.custom_emoji_id}</code> ${(msg.text ?? '').slice(e.offset, e.offset + e.length)}`);
    if (ids.length) {
      await sendMessage(chatId, `${ce('book')} custom_emoji_id:\n${ids.join('\n')}`);
      return;
    }
  }

  if (!raw) return;

  // ── Mandatory subscription gate ──────────────────────────────────────────────
  if (!ADMIN_IDS.includes(userId) && !(await isSubscribed(userId))) {
    // Remember referral code so it can be credited once they subscribe
    if (raw.startsWith('/start')) {
      const p = raw.slice(6).trim();
      if (p.startsWith('ref_')) pendingRef.set(userId, p.slice(4));
    }
    await sendGate(chatId);
    return;
  }

  const state = getState(userId);

  // ── /cancel ────────────────────────────────────────────────────────────────
  if (raw === '/cancel') {
    states.set(userId, { step: 'idle' });
    await sendMessage(chatId, `${ce('cross')} Отменено.`);
    return;
  }

  // ── /start ─────────────────────────────────────────────────────────────────
  if (raw.startsWith('/start')) {
    await startFlow(userId, chatId, msg.from.first_name, raw.slice(6).trim());
    return;
  }

  // ── /help ──────────────────────────────────────────────────────────────────
  if (raw === '/help') {
    await sendMessage(chatId, HELP);
    return;
  }

  // ── /add ───────────────────────────────────────────────────────────────────
  if (raw === '/add') {
    const premium = await isPremium(userId);
    await handleAddCommand(userId, chatId, states, premium);
    return;
  }

  // ── /remove ────────────────────────────────────────────────────────────────
  if (raw === '/remove') {
    await handleRemoveCommand(userId, chatId, states);
    return;
  }

  // ── /templates ─────────────────────────────────────────────────────────────
  if (raw === '/templates') {
    await handleTemplatesCommand(userId, chatId, states);
    return;
  }

  // ── /save [name] ───────────────────────────────────────────────────────────
  if (raw.startsWith('/save')) {
    await handleSaveCommand(userId, chatId, raw.slice(5).trim(), states);
    return;
  }

  // ── /apply [name] ──────────────────────────────────────────────────────────
  if (raw.startsWith('/apply')) {
    await handleApplyCommand(userId, chatId, raw.slice(6).trim(), states);
    return;
  }

  // ── /del [name] ────────────────────────────────────────────────────────────
  if (raw.startsWith('/del')) {
    await handleDeleteTemplate(userId, chatId, raw.slice(4).trim(), states);
    return;
  }

  // ── /premium ───────────────────────────────────────────────────────────────
  if (raw === '/premium') {
    await handlePremiumCommand(userId, chatId);
    return;
  }

  if (raw === '/buy_monthly') {
    await handleBuyMonthly(userId, chatId);
    return;
  }

  if (raw === '/buy_yearly') {
    await handleBuyYearly(userId, chatId);
    return;
  }

  // ── /ref ───────────────────────────────────────────────────────────────────
  if (raw === '/ref') {
    await handleRefCommand(userId, chatId);
    return;
  }

  // ── /schedule ──────────────────────────────────────────────────────────────
  if (raw === '/schedule') {
    await handleScheduleCommand(userId, chatId, states);
    return;
  }

  if (raw === '/queue') {
    await handleQueueCommand(userId, chatId);
    return;
  }

  if (raw.startsWith('/cancel_task')) {
    await handleCancelTask(userId, chatId, raw.slice(12).trim());
    return;
  }

  // ── /stats ─────────────────────────────────────────────────────────────────
  if (raw.startsWith('/stats')) {
    const arg = raw.slice(6).trim();
    // If arg looks like a post link
    if (arg.includes('t.me/')) {
      await handlePostStats(userId, chatId, arg);
    } else {
      await handleStatsCommand(userId, chatId, arg);
    }
    return;
  }

  // ── /admin ─────────────────────────────────────────────────────────────────
  if (raw === '/admin') {
    await handleAdminCommand(userId, chatId);
    return;
  }

  if (raw.startsWith('/grant_premium')) {
    await handleGrantPremium(userId, chatId, raw.slice(14).trim());
    return;
  }

  if (raw.startsWith('/broadcast')) {
    await handleBroadcast(userId, chatId, raw.slice(10).trim(), states);
    return;
  }

  // ── State machine ──────────────────────────────────────────────────────────

  if (state.step === 'waiting_link_add') {
    await handleLinkAdd(userId, chatId, raw, states);
    return;
  }

  if (state.step === 'waiting_buttons') {
    await handleButtonsInput(userId, chatId, raw, state, states);
    return;
  }

  if (state.step === 'waiting_link_remove') {
    await handleLinkRemove(userId, chatId, raw, states);
    return;
  }

  if (state.step === 'waiting_template_name_save') {
    await handleTemplateName(userId, chatId, raw, states);
    return;
  }

  if (state.step === 'waiting_template_buttons_save') {
    await handleTemplateButtonsSave(userId, chatId, raw, state.name, states);
    return;
  }

  if (state.step === 'waiting_template_apply_link') {
    await handleTemplateApplyLink(userId, chatId, raw, state.templateName, states);
    return;
  }

  if (state.step === 'waiting_template_delete_name') {
    await handleTemplateDeleteName(userId, chatId, raw, states);
    return;
  }

  if (state.step === 'waiting_schedule_link') {
    await handleScheduleLink(userId, chatId, raw, states);
    return;
  }

  if (state.step === 'waiting_schedule_buttons') {
    await handleScheduleButtons(userId, chatId, raw, state, states);
    return;
  }

  if (state.step === 'waiting_schedule_time') {
    await handleScheduleTime(userId, chatId, raw, state, states);
    return;
  }

  if (state.step === 'waiting_broadcast_text') {
    await handleBroadcastText(userId, chatId, raw, states);
    return;
  }

  // ── Default ────────────────────────────────────────────────────────────────
  await sendMessage(
    chatId,
    `${ce('bulb')} Напиши /add чтобы добавить кнопки к посту, или /help для справки.`,
  );
}
