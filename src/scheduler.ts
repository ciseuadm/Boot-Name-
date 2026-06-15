import cron from 'node-cron';
import { getPendingTasks, markTaskDone, markTaskFailed } from './db';
import { editMarkup, sendMessage } from './tg';
import { ce } from './emoji';
import { parseButtons } from './parser';
import { PREMIUM_MAX_BUTTONS } from './db';
import type { InlineButton } from './parser';

export function startScheduler(): void {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const tasks = await getPendingTasks();
      for (const task of tasks) {
        await runTask(task.id, task.user_id, task.post_chat_id, task.post_message_id, task.buttons_text);
      }
    } catch (e) {
      console.error('Scheduler error:', e);
    }
  });

  console.log('Scheduler started');
}

async function runTask(
  id: number,
  userId: number,
  postChatId: string,
  postMessageId: number,
  buttonsText: string,
): Promise<void> {
  try {
    const rows = parseButtons(buttonsText, PREMIUM_MAX_BUTTONS);
    if (!rows) {
      await markTaskFailed(id, 'Failed to parse buttons text');
      return;
    }

    const markup = {
      inline_keyboard: rows.map(row =>
        row.map((b: InlineButton) => ({ text: b.text, url: b.url })),
      ),
    };

    await editMarkup(postChatId, postMessageId, markup);
    await markTaskDone(id);

    await sendMessage(
      userId,
      `${ce('check')} Отложенная задача выполнена!\n\nКнопки добавлены к посту ${postChatId}/${postMessageId}.`,
    ).catch(() => {});
  } catch (e) {
    const errMsg = (e as Error).message;
    await markTaskFailed(id, errMsg);

    await sendMessage(
      userId,
      `${ce('cross')} Ошибка отложенной задачи #${id}:\n${errMsg}\n\nУбедись, что бот — администратор канала.`,
    ).catch(() => {});
  }
}
