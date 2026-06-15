import fetch from 'node-fetch';

export const BOT_TOKEN = process.env.BOT_TOKEN ?? '';

// Railway provides RAILWAY_PUBLIC_DOMAIN automatically — no manual WEBHOOK_URL needed
export const WEBHOOK_URL =
  process.env.WEBHOOK_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : '');

export const ADMIN_IDS = (process.env.ADMIN_IDS ?? '')
  .split(',')
  .map(s => parseInt(s.trim(), 10))
  .filter(Boolean);

if (!BOT_TOKEN) throw new Error('BOT_TOKEN env var is required');

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export let BOT_USERNAME = '';

// ─── Core API call ──────────────────────────────────────────────────────────

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(data.description ?? 'Telegram API error');
  return data.result;
}

// ─── Message helpers ────────────────────────────────────────────────────────

export async function sendMessage(
  chatId: number,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });
}

export async function sendPhoto(
  chatId: number,
  photo: string,
  caption: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await tg('sendPhoto', {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: 'HTML',
    ...extra,
  });
}

export async function editMarkup(
  chatId: string | number,
  messageId: number,
  markup: Record<string, unknown> | null,
): Promise<void> {
  await tg('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: markup ?? {},
  });
}

export async function answerCallback(callbackQueryId: string, text?: string): Promise<void> {
  await tg('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: false } : {}),
  });
}

export async function answerPreCheckout(
  preCheckoutQueryId: string,
  ok: boolean,
  errorMessage?: string,
): Promise<void> {
  await tg('answerPreCheckoutQuery', {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    ...(errorMessage ? { error_message: errorMessage } : {}),
  });
}

export async function sendInvoice(
  chatId: number,
  title: string,
  description: string,
  payload: string,
  labelText: string,
  starsAmount: number,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await tg('sendInvoice', {
    chat_id: chatId,
    title,
    description,
    payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: labelText, amount: starsAmount }],
    ...extra,
  });
}

// ─── Bot info ────────────────────────────────────────────────────────────────

export async function initBotInfo(): Promise<void> {
  const me = await tg<{ username: string }>('getMe', {});
  BOT_USERNAME = me.username;
}

export async function setWebhook(): Promise<void> {
  if (!WEBHOOK_URL) {
    console.log('No WEBHOOK_URL — skipping webhook setup');
    return;
  }
  const url = `${WEBHOOK_URL}/webhook/${BOT_TOKEN}`;
  await tg('setWebhook', { url, drop_pending_updates: true });
  console.log(`Webhook set: ${url}`);
}

export async function setMyCommands(): Promise<void> {
  await tg('setMyCommands', {
    commands: [
      { command: 'add',       description: 'Добавить кнопки к посту' },
      { command: 'remove',    description: 'Удалить кнопки с поста' },
      { command: 'templates', description: 'Мои шаблоны кнопок' },
      { command: 'schedule',  description: 'Отложить добавление кнопок' },
      { command: 'stats',     description: 'Аналитика кликов по кнопкам' },
      { command: 'premium',   description: 'Тариф и подписка' },
      { command: 'ref',       description: 'Реферальная программа' },
      { command: 'help',      description: 'Помощь' },
    ],
  });
}

// ─── Update types ────────────────────────────────────────────────────────────

export interface TgUser {
  id: number;
  first_name: string;
  username?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number };
  text?: string;
  successful_payment?: {
    currency: string;
    total_amount: number;
    invoice_payload: string;
    telegram_payment_charge_id: string;
  };
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgPreCheckoutQuery {
  id: string;
  from: TgUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  pre_checkout_query?: TgPreCheckoutQuery;
}
