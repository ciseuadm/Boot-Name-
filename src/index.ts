import express from 'express';
import fetch from 'node-fetch';
import { parsePostLink, parseButtons, formatButtonPreview, InlineButton } from './parser';

const BOT_TOKEN  = process.env.BOT_TOKEN ?? '';
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? '';
const PORT = parseInt(process.env.PORT ?? '3000', 10);

if (!BOT_TOKEN) throw new Error('BOT_TOKEN env var is required');

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ─── Telegram API helpers ──────────────────────────────────────────────────

async function tg<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(data.description ?? 'Telegram API error');
  return data.result;
}

async function sendMessage(chatId: number, text: string, extra: Record<string, unknown> = {}): Promise<void> {
  await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
}

async function editMarkup(chatId: string | number, messageId: number, markup: Record<string, unknown> | null): Promise<void> {
  await tg('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: markup ?? {},
  });
}

// ─── State machine ─────────────────────────────────────────────────────────

type UserState =
  | { step: 'idle' }
  | { step: 'waiting_link_add' }
  | { step: 'waiting_link_remove' }
  | { step: 'waiting_buttons'; chatId: string | number; messageId: number };

const states = new Map<number, UserState>();

function getState(userId: number): UserState {
  return states.get(userId) ?? { step: 'idle' };
}

// ─── Message texts ─────────────────────────────────────────────────────────

const HELP = `☑️ <b>Add Button Bot</b>

Добавляю кнопки к постам в твоём Telegram-канале — без рекламы и лишних пометок.

<b>Доступные команды:</b>
/start - Открыть главное меню
/add — добавить кнопки к посту или изменить уже существующие
/remove — удалить все кнопки с поста

<b>Как начать:</b>

Добавь меня в администраторы своего канала
Выдай право «Редактировать сообщения»
Отправь команду /add и следуй инструкции`;

const BUTTON_FORMAT_HELP = `<b>Формат кнопок:</b>

Каждая строка — отдельный ряд.
В строке пары <code>Текст | URL</code>, разделённые <code>|</code>.

<b>Примеры:</b>

Одна кнопка:
<code>Играть 🎮 | https://t.me/bot</code>

Две кнопки в ряд:
<code>Канал | https://t.me/ch | Чат | https://t.me/chat</code>

Компактная сетка (знаки зодиака):
<code>♈ Овен | url | ♉ Телец | url | ♊ Близнецы | url
♋ Рак | url | ♌ Лев | url | ♍ Дева | url
♎ Весы | url | ♏ Скорпион | url | ♐ Стрелец | url
♑ Козерог | url | ♒ Водолей | url | ♓ Рыбы | url</code>

Максимум: <b>20 кнопок</b>, <b>8 в ряд</b>.`;

// ─── Update handler ────────────────────────────────────────────────────────

interface TgMessage {
  message_id: number;
  from?: { id: number; first_name: string };
  chat: { id: number };
  text?: string;
}

interface TgUpdate {
  message?: TgMessage;
}

async function handleUpdate(update: TgUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.from) return;

  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text   = (msg.text ?? '').trim();
  const state  = getState(userId);

  // ── Commands ──────────────────────────────────────────────────────────────

  if (text === '/start' || text === '/help') {
    states.set(userId, { step: 'idle' });
    await sendMessage(chatId, HELP);
    return;
  }

  if (text === '/add') {
    states.set(userId, { step: 'waiting_link_add' });
    await sendMessage(chatId,
      '🔗 Отправь ссылку на пост в твоём канале.\n\n' +
      'Как получить ссылку: зайди в канал → зажми нужный пост → <b>Скопировать ссылку</b>\n\n' +
      '❌ /cancel — отмена',
    );
    return;
  }

  if (text === '/remove') {
    states.set(userId, { step: 'waiting_link_remove' });
    await sendMessage(chatId,
      '🔗 Отправь ссылку на пост, с которого нужно убрать кнопки.\n\n' +
      '❌ /cancel — отмена',
    );
    return;
  }

  if (text === '/cancel') {
    states.set(userId, { step: 'idle' });
    await sendMessage(chatId, '❌ Отменено.');
    return;
  }

  // ── State: waiting for post link (add) ───────────────────────────────────

  if (state.step === 'waiting_link_add') {
    const parsed = parsePostLink(text);
    if (!parsed) {
      await sendMessage(chatId,
        '❌ Не распознал ссылку.\n\n' +
        'Ожидаю формат:\n' +
        '<code>https://t.me/канал/42</code> — публичный канал\n' +
        '<code>https://t.me/c/1234567890/42</code> — приватный канал\n\n' +
        '❌ /cancel — отмена',
      );
      return;
    }

    states.set(userId, { step: 'waiting_buttons', chatId: parsed.chatId, messageId: parsed.messageId });
    await sendMessage(chatId,
      `✅ Пост найден!\n\n${BUTTON_FORMAT_HELP}\n\nОтправь кнопки 👇\n\n❌ /cancel — отмена`,
    );
    return;
  }

  // ── State: waiting for post link (remove) ────────────────────────────────

  if (state.step === 'waiting_link_remove') {
    const parsed = parsePostLink(text);
    if (!parsed) {
      await sendMessage(chatId,
        '❌ Не распознал ссылку. Попробуй ещё раз.\n\n❌ /cancel — отмена',
      );
      return;
    }

    states.set(userId, { step: 'idle' });
    try {
      await editMarkup(parsed.chatId, parsed.messageId, null);
      await sendMessage(chatId, '✅ Кнопки убраны с поста!');
    } catch (e) {
      await sendMessage(chatId, `❌ Ошибка: ${(e as Error).message}\n\nУбедись, что я администратор канала с правом редактировать сообщения.`);
    }
    return;
  }

  // ── State: waiting for button layout ─────────────────────────────────────

  if (state.step === 'waiting_buttons') {
    const rows = parseButtons(text);
    if (!rows) {
      await sendMessage(chatId,
        `❌ Не смог разобрать кнопки. Проверь формат.\n\n${BUTTON_FORMAT_HELP}\n\n❌ /cancel — отмена`,
      );
      return;
    }

    const { chatId: postChatId, messageId } = state;
    states.set(userId, { step: 'idle' });

    try {
      const markup = { inline_keyboard: rows.map(row => row.map((b: InlineButton) => ({ text: b.text, url: b.url }))) };
      await editMarkup(postChatId, messageId, markup);

      const total = rows.reduce((s, r) => s + r.length, 0);
      const preview = formatButtonPreview(rows);
      await sendMessage(chatId,
        `✅ Готово! Добавил ${total} ${btnWord(total)}:\n\n<code>${preview}</code>`,
      );
    } catch (e) {
      await sendMessage(chatId,
        `❌ Ошибка: ${(e as Error).message}\n\nУбедись, что:\n• Я администратор канала\n• У меня есть право <i>Редактировать сообщения</i>\n• Ссылка ведёт на верный пост`,
      );
    }
    return;
  }

  // ── Idle: no active state ─────────────────────────────────────────────────

  await sendMessage(chatId, 'Привет! 🐤 Напиши /add чтобы добавить кнопки к посту, или /help для справки.');
}

function btnWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'кнопку';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'кнопки';
  return 'кнопок';
}

// ─── Express server ────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.post(`/webhook/${BOT_TOKEN}`, async (req, res) => {
  res.sendStatus(200);
  try {
    await handleUpdate(req.body as TgUpdate);
  } catch (e) {
    console.error('Update error:', e);
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, async () => {
  console.log(`Button Bot running on port ${PORT}`);

  if (WEBHOOK_URL) {
    const webhookEndpoint = `${WEBHOOK_URL}/webhook/${BOT_TOKEN}`;
    try {
      await tg('setWebhook', { url: webhookEndpoint, drop_pending_updates: true });
      console.log(`Webhook set: ${webhookEndpoint}`);
    } catch (e) {
      console.error('Failed to set webhook:', e);
    }
  } else {
    console.log('No WEBHOOK_URL — set it in env vars for production');
  }
});
