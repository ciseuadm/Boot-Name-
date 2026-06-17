import { sendMessage, isChatAdmin } from '../tg';
import { ce } from '../emoji';
import { NOT_CHANNEL_ADMIN } from './add';
import {
  isPremium,
  createScheduledTask,
  getUserScheduledTasks,
  cancelScheduledTask,
} from '../db';
import { parsePostLink, parseButtons, formatButtonPreview } from '../parser';
import { PREMIUM_MAX_BUTTONS } from '../db';
import type { UserState } from '../bot';

// ── /schedule command ─────────────────────────────────────────────────────────

export async function handleScheduleCommand(
  userId: number,
  chatId: number,
  states: Map<number, UserState>,
): Promise<void> {
  const premium = await isPremium(userId);
  if (!premium) {
    await sendMessage(
      chatId,
      `${ce('alarm')} <b>Отложенные кнопки</b> — функция Premium.\n\n` +
        `Позволяет применить кнопки к посту через заданное время — например, через час после публикации.\n\n` +
        `${ce('gem')} /premium — подключить`,
    );
    return;
  }

  states.set(userId, { step: 'waiting_schedule_link' });
  await sendMessage(
    chatId,
    `${ce('alarm')} <b>Отложенные кнопки</b>\n\n` +
      `Шаг 1/3: ${ce('link')} Отправь ссылку на пост:\n\n/cancel — отмена`,
  );
}

// ── /queue — список отложенных задач ─────────────────────────────────────────

export async function handleQueueCommand(userId: number, chatId: number): Promise<void> {
  const tasks = await getUserScheduledTasks(userId);
  if (tasks.length === 0) {
    await sendMessage(chatId, `${ce('bulb')} У тебя нет запланированных задач.`);
    return;
  }

  const lines = tasks.map((t, i) => {
    const date = new Date(t.run_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    return `${i + 1}. ID <code>${t.id}</code> — ${date} МСК\n   Пост: ${t.post_chat_id}/${t.post_message_id}`;
  });

  await sendMessage(
    chatId,
    `${ce('alarm')} <b>Запланированные задачи</b>:\n\n${lines.join('\n\n')}\n\n` +
      `Отменить: <code>/cancel_task ID</code>`,
  );
}

export async function handleCancelTask(
  userId: number,
  chatId: number,
  arg: string,
): Promise<void> {
  const id = parseInt(arg.trim(), 10);
  if (isNaN(id)) {
    await sendMessage(chatId, `${ce('warning')} Укажи ID задачи: <code>/cancel_task 42</code>`);
    return;
  }
  const cancelled = await cancelScheduledTask(id, userId);
  if (cancelled) {
    await sendMessage(chatId, `${ce('check')} Задача #${id} отменена.`);
  } else {
    await sendMessage(chatId, `${ce('cross')} Задача #${id} не найдена или уже выполнена.`);
  }
}

// ── State handlers ────────────────────────────────────────────────────────────

export async function handleScheduleLink(
  userId: number,
  chatId: number,
  text: string,
  states: Map<number, UserState>,
): Promise<void> {
  const parsed = parsePostLink(text);
  if (!parsed) {
    await sendMessage(chatId, `${ce('warning')} Не распознал ссылку. Попробуй ещё раз.\n\n/cancel — отмена`);
    return;
  }

  if (!(await isChatAdmin(parsed.chatId, userId))) {
    states.set(userId, { step: 'idle' });
    await sendMessage(chatId, NOT_CHANNEL_ADMIN);
    return;
  }

  states.set(userId, {
    step: 'waiting_schedule_buttons',
    chatId: parsed.chatId,
    messageId: parsed.messageId,
  });
  await sendMessage(
    chatId,
    `${ce('radio')} Пост найден!\n\nШаг 2/3: ${ce('puzzle')} Отправь кнопки (формат: <code>Текст | URL</code>):\n\n/cancel — отмена`,
  );
}

export async function handleScheduleButtons(
  userId: number,
  chatId: number,
  text: string,
  state: Extract<UserState, { step: 'waiting_schedule_buttons' }>,
  states: Map<number, UserState>,
): Promise<void> {
  const rows = parseButtons(text, PREMIUM_MAX_BUTTONS);
  if (!rows) {
    await sendMessage(
      chatId,
      `${ce('warning')} Не смог разобрать кнопки. Формат: <code>Текст | URL</code>\n\n/cancel — отмена`,
    );
    return;
  }

  states.set(userId, {
    step: 'waiting_schedule_time',
    chatId: state.chatId,
    messageId: state.messageId,
    buttonsText: text,
  });

  const preview = formatButtonPreview(rows);
  await sendMessage(
    chatId,
    `${ce('check')} Кнопки:\n<code>${preview}</code>\n\n` +
      `Шаг 3/3: ${ce('bell')} Через сколько часов применить?\n` +
      `Введи число от 1 до 168 (7 дней):\n\n/cancel — отмена`,
  );
}

export async function handleScheduleTime(
  userId: number,
  chatId: number,
  text: string,
  state: Extract<UserState, { step: 'waiting_schedule_time' }>,
  states: Map<number, UserState>,
): Promise<void> {
  const hours = parseFloat(text.trim().replace(',', '.'));
  if (isNaN(hours) || hours < 0.1 || hours > 168) {
    await sendMessage(
      chatId,
      `${ce('warning')} Введи число от 0.1 до 168 (часы).\n\nНапример: <code>1</code>, <code>2.5</code>, <code>24</code>`,
    );
    return;
  }

  const runAt = new Date(Date.now() + hours * 3600 * 1000);
  const task = await createScheduledTask(
    userId,
    String(state.chatId),
    state.messageId,
    state.buttonsText,
    runAt,
  );

  states.set(userId, { step: 'idle' });

  const timeStr = runAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  await sendMessage(
    chatId,
    `${ce('check')} <b>Задача создана!</b>\n\nID: <code>${task.id}</code>\nВремя: ${timeStr} МСК\n\nПосмотреть очередь: /queue\nОтменить: <code>/cancel_task ${task.id}</code>`,
  );
}
