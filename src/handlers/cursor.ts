// Telegram ⇄ Cursor bridge (admin-only).
//
// Flow:
//   /cursor          → enter Cursor mode (continues the last conversation)
//   <any text>       → dispatched to a Cursor cloud agent as a task
//   /cursor_new      → start a fresh conversation for the next task
//   /cursor_cancel   → cancel the task currently running
//   /cursor_off      → leave Cursor mode
//
// When a task finishes, its answer (and PR link, if any) is sent back to the
// same chat with a clear "ответ от Cursor" signature.

import { ADMIN_IDS, sendMessage, sendPlain, getMessageText, messageHasImage, downloadMessageImages, TgMessage } from '../tg';
import { ce } from '../emoji';
import {
  cursorConfigured,
  runCursorTask,
  awaitExistingRun,
  cancelCursorRun,
  checkCursorRepoAccess,
  formatCursorError,
  cursorAgentUrl,
  CursorOutcome,
  CursorTaskPayload,
} from '../cursor';
import type { UserState } from '../bot';
import {
  createCursorTask,
  setCursorTaskRun,
  finishCursorTask,
  getRunningCursorTasks,
  getLatestCursorAgent,
} from '../db';

// Active conversation per admin (agent id). Seeded from DB on first use so the
// thread survives process restarts.
const session = new Map<number, string>();
// Whether an admin explicitly reset the conversation and the next task must
// start a brand-new agent.
const forceNew = new Set<number>();
// The task currently running per admin, so it can be cancelled.
const inFlight = new Map<number, { taskId: number; agentId?: string; runId?: string }>();

function isAdmin(userId: number): boolean {
  return ADMIN_IDS.includes(userId);
}

const NOT_CONFIGURED =
  `${ce('warning')} <b>Связь с Cursor не настроена.</b>\n\n` +
  `Добавь переменную окружения <code>CURSOR_API_KEY</code> (ключ из ` +
  `Cursor Dashboard → Integrations) и перезапусти бота. Репозиторий и ветка ` +
  `берутся из <code>CURSOR_REPO_URL</code> / <code>CURSOR_REPO_REF</code>.`;

// ── Commands ──────────────────────────────────────────────────────────────────

export async function handleCursorCommand(
  userId: number,
  chatId: number,
  states: Map<number, UserState>,
): Promise<void> {
  if (!isAdmin(userId)) return;
  if (!cursorConfigured()) {
    await sendMessage(chatId, NOT_CONFIGURED);
    return;
  }

  states.set(userId, { step: 'cursor_mode' });

  const access = await checkCursorRepoAccess();
  if (!access.ok) {
    states.set(userId, { step: 'idle' });
    await sendMessage(chatId, `${ce('warning')} ${access.message}`);
    return;
  }

  // Resume the previous conversation if one exists.
  if (!session.has(userId)) {
    const last = await getLatestCursorAgent(userId).catch(() => null);
    if (last) session.set(userId, last);
  }
  const continuing = session.has(userId) && !forceNew.has(userId);

  await sendMessage(
    chatId,
    `${ce('rocket')} <b>Связь с Cursor включена.</b>\n\n` +
      `Отправляй задачу <b>текстом</b> или <b>фото</b> (можно с подписью) — изображение попадёт в Cursor.\n\n` +
      (continuing
        ? `${ce('bulb')} Продолжаю прошлый диалог. /cursor_new — начать новый.\n`
        : `${ce('bulb')} Будет начат новый диалог.\n`) +
      `\n<b>Управление:</b>\n` +
      `/cursor_new — новый диалог\n` +
      `/cursor_cancel — отменить текущую задачу\n` +
      `/cursor_off — выйти из режима`,
  );
}

export async function handleCursorNew(userId: number, chatId: number): Promise<void> {
  if (!isAdmin(userId)) return;
  session.delete(userId);
  forceNew.add(userId);
  await sendMessage(chatId, `${ce('spark')} Следующая задача начнёт новый диалог Cursor.`);
}

export async function handleCursorOff(
  userId: number,
  chatId: number,
  states: Map<number, UserState>,
): Promise<void> {
  if (!isAdmin(userId)) return;
  states.set(userId, { step: 'idle' });
  await sendMessage(chatId, `${ce('check')} Режим Cursor выключен.`);
}

export async function handleCursorCancel(userId: number, chatId: number): Promise<void> {
  if (!isAdmin(userId)) return;
  const cur = inFlight.get(userId);
  if (!cur?.agentId || !cur.runId) {
    await sendMessage(chatId, `${ce('bulb')} Сейчас нет запущенной задачи Cursor.`);
    return;
  }
  try {
    await cancelCursorRun(cur.agentId, cur.runId);
    inFlight.delete(userId);
    await sendMessage(chatId, `${ce('cross')} Отменяю текущую задачу Cursor…`);
  } catch (e) {
    await sendMessage(chatId, `${ce('warning')} Не удалось отменить: ${(e as Error).message}`);
  }
}

// ── Task dispatch ───────────────────────────────────────────────────────────

const PHOTO_ONLY_PROMPT =
  'Пользователь отправил изображение без текста. Проанализируй его и выполни задачу, которую оно подразумевает.';

/** Accepts text, photo, or photo+ caption and forwards everything to Cursor. */
export async function handleCursorMessage(
  userId: number,
  chatId: number,
  msg: TgMessage,
): Promise<void> {
  if (!isAdmin(userId)) return;
  if (!cursorConfigured()) {
    await sendMessage(chatId, NOT_CONFIGURED);
    return;
  }
  if (inFlight.has(userId)) {
    await sendMessage(
      chatId,
      `${ce('alarm')} Cursor ещё работает над прошлой задачей. Дождись ответа или /cursor_cancel.`,
    );
    return;
  }

  const hasImage = messageHasImage(msg);
  const caption = getMessageText(msg);
  if (!caption && !hasImage) return;

  let images: CursorTaskPayload['images'];
  if (hasImage) {
    images = await downloadMessageImages(msg);
    if (images.length === 0) {
      await sendMessage(
        chatId,
        `${ce('warning')} Не удалось загрузить изображение (макс. 5 МБ, форматы JPEG/PNG/WebP/GIF).`,
      );
      return;
    }
  }

  const payload: CursorTaskPayload = {
    text: caption || PHOTO_ONLY_PROMPT,
    images,
  };

  const prevAgentId = forceNew.has(userId) ? null : session.get(userId) ?? null;
  const logPrompt = payload.text + (images?.length ? ` [+${images.length} image]` : '');
  const taskId = await createCursorTask(userId, chatId, logPrompt);
  inFlight.set(userId, { taskId });

  const imageNote = images?.length ? ` (+ ${images.length} фото)` : '';
  await sendMessage(
    chatId,
    `${ce('rocket')} Задача отправлена в Cursor${imageNote}${prevAgentId ? ' (продолжение диалога)' : ' (новый диалог)'}.\n` +
      `${ce('alarm')} Работаю… пришлю ответ, как будет готово.`,
  );

  void executeCursorTaskWork(userId, chatId, payload, prevAgentId, taskId).catch(err => {
    console.error('Cursor task failed:', err);
    inFlight.delete(userId);
    sendMessage(chatId, `${ce('cross')} Внутренняя ошибка Cursor-задачи.`).catch(() => {});
  });
}

async function executeCursorTaskWork(
  userId: number,
  chatId: number,
  payload: CursorTaskPayload,
  prevAgentId: string | null,
  taskId: number,
): Promise<void> {
  try {
    const outcome = await runCursorTask(payload, prevAgentId, async (agentId, runId) => {
      session.set(userId, agentId);
      forceNew.delete(userId);
      inFlight.set(userId, { taskId, agentId, runId });
      await setCursorTaskRun(taskId, agentId, runId);
      await sendMessage(
        chatId,
        `${ce('link')} Смотреть агента в Cursor:\n${cursorAgentUrl(agentId)}\n\n` +
          `${ce('bulb')} Это <b>Cloud Agent</b> — он не появится в списке локальных чатов слева.`,
      ).catch(() => {});
    });

    await finishCursorTask(taskId, outcome.status, outcome.result ?? null, outcome.prUrl ?? null);
    await deliverOutcome(chatId, outcome);
  } catch (e) {
    await finishCursorTask(taskId, 'error', formatCursorError(e), null);
    await sendMessage(
      chatId,
      `${ce('cross')} <b>Ошибка запуска Cursor:</b>\n\n${formatCursorError(e)}`,
    );
  } finally {
    inFlight.delete(userId);
  }
}

async function deliverOutcome(chatId: number, outcome: CursorOutcome): Promise<void> {
  if (outcome.status !== 'finished') {
    await sendMessage(
      chatId,
      `${ce('warning')} Задача Cursor завершилась со статусом <b>${outcome.status}</b>.`,
    );
    if (outcome.result) await sendPlain(chatId, outcome.result);
    return;
  }

  await sendMessage(chatId, `${ce('check')} <b>Ответ от Cursor:</b>`);
  await sendPlain(chatId, outcome.result ?? '(агент не вернул текста)');
  if (outcome.prUrl) {
    await sendMessage(
      chatId,
      `${ce('link')} Pull request: ${outcome.prUrl}\n\n` +
        `${ce('warning')} <b>Важно:</b> бот на Railway обновляется только после merge PR в <code>main</code>. ` +
        `Пока PR открыт — в боте старый код.`,
    );
  }
}

// ── Crash recovery ────────────────────────────────────────────────────────────

/**
 * After a restart, re-attach to any task that was still running and deliver its
 * answer once it finishes. Runs in the background; never throws.
 */
export async function recoverCursorTasks(): Promise<void> {
  if (!cursorConfigured()) return;
  let tasks;
  try {
    tasks = await getRunningCursorTasks();
  } catch {
    return;
  }
  for (const t of tasks) {
    if (!t.agent_id || !t.run_id) continue;
    const agentId = t.agent_id;
    const runId = t.run_id;
    (async () => {
      try {
        const outcome = await awaitExistingRun(agentId, runId);
        await finishCursorTask(t.id, outcome.status, outcome.result ?? null, outcome.prUrl ?? null);
        await deliverOutcome(t.chat_id, outcome);
      } catch (e) {
        await finishCursorTask(t.id, 'error', (e as Error).message, null).catch(() => {});
      }
    })();
  }
}
