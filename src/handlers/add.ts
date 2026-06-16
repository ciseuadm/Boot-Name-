import { sendMessage, editMarkup } from '../tg';
import { ce } from '../emoji';
import {
  isPremium,
  logUsage,
  getDailyUsage,
  FREE_DAILY_LIMIT,
  FREE_MAX_BUTTONS,
  PREMIUM_MAX_BUTTONS,
} from '../db';
import { parseButtons, formatButtonPreview, InlineButton } from '../parser';
import type { UserState } from '../bot';

export const BUTTON_FORMAT_HELP = `<b>Формат кнопок:</b>

Каждая строка — отдельный ряд кнопок.
В строке чередуются <code>Текст | URL</code>, разделённые <code>|</code>.

Одна кнопка:
<code>Играть 🎮 | https://t.me/bot</code>

Две кнопки в ряд:
<code>Канал | https://t.me/ch | Чат | https://t.me/chat</code>

Сетка 3×4 (знаки зодиака):
<code>♈ Овен | url | ♉ Телец | url | ♊ Близнецы | url
♋ Рак | url | ♌ Лев | url | ♍ Дева | url
♎ Весы | url | ♏ Скорпион | url | ♐ Стрелец | url
♑ Козерог | url | ♒ Водолей | url | ♓ Рыбы | url</code>`;

export async function handleAddCommand(
  userId: number,
  chatId: number,
  states: Map<number, UserState>,
  premium: boolean,
): Promise<void> {
  if (!premium) {
    const used = await getDailyUsage(userId);
    if (used >= FREE_DAILY_LIMIT) {
      await sendMessage(
        chatId,
        `${ce('warning')} <b>Лимит исчерпан</b>\n\nБесплатный тариф: ${FREE_DAILY_LIMIT} применений кнопок в сутки.\nЛимит обновится через несколько часов.\n\n${ce('gem')} <b>Premium</b> снимает все ограничения.\n${ce('rocket')} /premium — подключить`,
      );
      return;
    }
  }

  states.set(userId, { step: 'waiting_link_add' });
  await sendMessage(
    chatId,
    `${ce('link')} Отправь ссылку на пост в канале.\n\n` +
      'Как получить: зайди в канал → зажми пост → <b>Скопировать ссылку</b>\n\n' +
      '/cancel — отмена',
  );
}

export async function handleLinkAdd(
  userId: number,
  chatId: number,
  text: string,
  states: Map<number, UserState>,
): Promise<void> {
  const { parsePostLink } = await import('../parser');
  const parsed = parsePostLink(text);
  if (!parsed) {
    await sendMessage(
      chatId,
      `${ce('warning')} Не распознал ссылку.\n\n` +
        'Ожидаю формат:\n' +
        '<code>https://t.me/канал/42</code> — публичный\n' +
        '<code>https://t.me/c/1234567890/42</code> — приватный\n\n' +
        '/cancel — отмена',
    );
    return;
  }

  const maxButtons = (await isPremium(userId)) ? PREMIUM_MAX_BUTTONS : FREE_MAX_BUTTONS;
  const premium = await isPremium(userId);

  states.set(userId, {
    step: 'waiting_buttons',
    chatId: parsed.chatId,
    messageId: parsed.messageId,
  });

  const limitNote = premium
    ? `до ${PREMIUM_MAX_BUTTONS} кнопок`
    : `до ${FREE_MAX_BUTTONS} кнопок (Free). <a href="tg://resolve?domain=">Premium</a> — до ${PREMIUM_MAX_BUTTONS}`;

  await sendMessage(
    chatId,
    `${ce('radio')} Пост найден! (${limitNote})\n\n${BUTTON_FORMAT_HELP}\n\nОтправь кнопки 👇\n\n/cancel — отмена`,
  );
}

export async function handleButtonsInput(
  userId: number,
  chatId: number,
  text: string,
  state: Extract<UserState, { step: 'waiting_buttons' }>,
  states: Map<number, UserState>,
): Promise<void> {
  const premium = await isPremium(userId);
  const maxButtons = premium ? PREMIUM_MAX_BUTTONS : FREE_MAX_BUTTONS;
  const rows = parseButtons(text, maxButtons);

  if (!rows) {
    const limit = premium ? PREMIUM_MAX_BUTTONS : FREE_MAX_BUTTONS;
    await sendMessage(
      chatId,
      `${ce('warning')} Не смог разобрать кнопки.\n\nПроверь формат или лимит (макс. ${limit} кнопок).\n\n${BUTTON_FORMAT_HELP}\n\n/cancel — отмена`,
    );
    return;
  }

  const { chatId: postChatId, messageId } = state;
  states.set(userId, { step: 'idle' });

  try {
    const markup = {
      inline_keyboard: rows.map(row =>
        row.map((b: InlineButton) => ({ text: b.text, url: b.url })),
      ),
    };
    await editMarkup(postChatId, messageId, markup);
    await logUsage(userId, 'add_buttons');

    const total = rows.reduce((s, r) => s + r.length, 0);
    const preview = formatButtonPreview(rows);

    await sendMessage(
      chatId,
      `${ce('check')} Готово! Добавил ${total} ${btnWord(total)}:\n\n<code>${preview}</code>\n\n${ce('dividers')} Сохранить как шаблон: /save`,
    );
  } catch (e) {
    await sendMessage(
      chatId,
      `${ce('cross')} Ошибка: ${(e as Error).message}\n\nУбедись, что:\n• Бот — администратор канала\n• Есть право <i>Редактировать сообщения</i>\n• Ссылка ведёт на верный пост`,
    );
  }
}

function btnWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'кнопку';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'кнопки';
  return 'кнопок';
}
