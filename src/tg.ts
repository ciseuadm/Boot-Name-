import fetch from 'node-fetch';
import crypto from 'crypto';
import { stripCustomEmoji } from './emoji';

export const BOT_TOKEN = process.env.BOT_TOKEN ?? '';

// Secret used to authenticate incoming webhook calls. Telegram echoes it back in
// the `X-Telegram-Bot-Api-Secret-Token` header on every update, so we can reject
// anyone POSTing to the webhook who is not Telegram — defense in depth on top of
// the bot-token-in-path. Defaults to a stable value derived from the bot token
// so the gate works without extra configuration, but can be overridden.
export const WEBHOOK_SECRET =
  process.env.WEBHOOK_SECRET ||
  crypto.createHash('sha256').update(`whk:${BOT_TOKEN}`).digest('hex').slice(0, 48);

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Escapes the 3 characters that are significant in Telegram's HTML parse mode.
 * Apply to ANY user-controlled value before interpolating it into an HTML
 * message, otherwise malformed input breaks our own messages (Telegram rejects
 * invalid HTML) or lets a user inject markup/links into the rendered text.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

export function getMessageText(msg: TgMessage): string {
  return (msg.text ?? msg.caption ?? '').trim();
}

export function messageHasPhoto(msg: TgMessage): boolean {
  return (msg.photo?.length ?? 0) > 0;
}

/** Photo attachment or image sent as a document (PNG/JPEG/WebP/GIF). */
export function messageHasImage(msg: TgMessage): boolean {
  if (messageHasPhoto(msg)) return true;
  const mime = msg.document?.mime_type ?? '';
  return mime.startsWith('image/');
}

export interface DownloadedImage {
  data: string;
  mimeType: string;
  width?: number;
  height?: number;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function guessMimeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

/** Downloads image(s) from a Telegram message for forwarding to Cursor SDK. */
export async function downloadMessageImages(msg: TgMessage): Promise<DownloadedImage[]> {
  if (msg.photo?.length) {
    const photo = msg.photo[msg.photo.length - 1]!;
    const img = await downloadTelegramFile(photo.file_id, photo.width, photo.height);
    return img ? [img] : [];
  }
  if (msg.document?.mime_type?.startsWith('image/')) {
    const img = await downloadTelegramFile(
      msg.document.file_id,
      undefined,
      undefined,
      msg.document.mime_type,
    );
    return img ? [img] : [];
  }
  return [];
}

async function downloadTelegramFile(
  fileId: string,
  width?: number,
  height?: number,
  mimeHint?: string,
): Promise<DownloadedImage | null> {
  const meta = await tg<{ file_path: string; file_size?: number }>('getFile', { file_id: fileId });
  if (meta.file_size && meta.file_size > MAX_IMAGE_BYTES) return null;

  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${meta.file_path}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) return null;

  return {
    data: buf.toString('base64'),
    mimeType: mimeHint ?? guessMimeFromPath(meta.file_path),
    width,
    height,
  };
}

export async function sendMessage(
  chatId: number,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await tg('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra,
    });
  } catch (e) {
    // Fall back to plain emoji if premium custom emoji can't be sent
    if (text.includes('<tg-emoji')) {
      await tg('sendMessage', {
        chat_id: chatId,
        text: stripCustomEmoji(text),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...extra,
      });
      return;
    }
    throw e;
  }
}

/**
 * Sends plain text (no HTML parsing). Use for arbitrary/untrusted content such
 * as a Cursor agent's answer, which may contain `<`, `>` or code that would
 * break HTML parse mode. Long messages are split to fit Telegram's 4096 limit.
 */
export async function sendPlain(chatId: number, text: string): Promise<void> {
  const CHUNK = 3900;
  const body = text.length > 0 ? text : '(пустой ответ)';
  for (let i = 0; i < body.length; i += CHUNK) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: body.slice(i, i + CHUNK),
      disable_web_page_preview: true,
    });
  }
}

/** Broadcasts a short notice to every configured admin (best-effort). */
export async function notifyAdmins(text: string): Promise<void> {
  await Promise.all(
    ADMIN_IDS.map(id => sendMessage(id, text).catch(() => {})),
  );
}

export async function sendPhoto(
  chatId: number,
  photo: string,
  caption: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await tg('sendPhoto', {
      chat_id: chatId,
      photo,
      caption,
      parse_mode: 'HTML',
      ...extra,
    });
  } catch (e) {
    if (caption.includes('<tg-emoji')) {
      await tg('sendPhoto', {
        chat_id: chatId,
        photo,
        caption: stripCustomEmoji(caption),
        parse_mode: 'HTML',
        ...extra,
      });
      return;
    }
    throw e;
  }
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

export async function answerCallback(
  callbackQueryId: string,
  text?: string,
  showAlert = false,
): Promise<void> {
  await tg('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: showAlert } : {}),
  });
}

export interface TgChatMember {
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
  is_member?: boolean;
}

export async function getChatMember(
  chatId: string | number,
  userId: number,
): Promise<TgChatMember> {
  return tg<TgChatMember>('getChatMember', { chat_id: chatId, user_id: userId });
}

/**
 * Whether the user is the owner or an administrator of the given chat/channel.
 * Returns false if the status can't be resolved (e.g. user not in the chat,
 * or the bot lacks rights to query members).
 */
export async function isChatAdmin(
  chatId: string | number,
  userId: number,
): Promise<boolean> {
  try {
    const m = await getChatMember(chatId, userId);
    return m.status === 'creator' || m.status === 'administrator';
  } catch {
    return false;
  }
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
  await tg('setWebhook', {
    url,
    drop_pending_updates: true,
    secret_token: WEBHOOK_SECRET,
    max_connections: 40,
  });
  console.log(`Webhook set: ${url}`);
}

export async function setMyCommands(): Promise<void> {
  await tg('setMyCommands', {
    commands: [
      { command: 'add',       description: 'Добавить кнопки к посту' },
      { command: 'remove',    description: 'Удалить кнопки с поста' },
      { command: 'templates', description: 'Мои шаблоны кнопок' },
      { command: 'schedule',  description: 'Отложить добавление кнопок' },
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

export interface TgMessageEntity {
  type: string;
  offset: number;
  length: number;
  custom_emoji_id?: string;
}

export interface TgPhotoSize {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TgDocument {
  file_id: string;
  mime_type?: string;
  file_name?: string;
  file_size?: number;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: TgDocument;
  entities?: TgMessageEntity[];
  caption_entities?: TgMessageEntity[];
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
