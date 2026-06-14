import { sendMessage, editMarkup } from '../tg';
import { parsePostLink } from '../parser';
import type { UserState } from '../bot';

export async function handleRemoveCommand(
  userId: number,
  chatId: number,
  states: Map<number, UserState>,
): Promise<void> {
  states.set(userId, { step: 'waiting_link_remove' });
  await sendMessage(
    chatId,
    '🔗 Отправь ссылку на пост, с которого нужно убрать кнопки.\n\n❌ /cancel — отмена',
  );
}

export async function handleLinkRemove(
  userId: number,
  chatId: number,
  text: string,
  states: Map<number, UserState>,
): Promise<void> {
  const parsed = parsePostLink(text);
  if (!parsed) {
    await sendMessage(
      chatId,
      '❌ Не распознал ссылку. Попробуй ещё раз.\n\n❌ /cancel — отмена',
    );
    return;
  }

  states.set(userId, { step: 'idle' });
  try {
    await editMarkup(parsed.chatId, parsed.messageId, null);
    await sendMessage(chatId, '✅ Кнопки убраны с поста!');
  } catch (e) {
    await sendMessage(
      chatId,
      `❌ Ошибка: ${(e as Error).message}\n\nУбедись, что бот — администратор канала с правом редактировать сообщения.`,
    );
  }
}
