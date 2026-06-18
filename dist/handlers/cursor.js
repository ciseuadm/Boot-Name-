"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCursorCommand = handleCursorCommand;
exports.handleCursorNew = handleCursorNew;
exports.handleCursorOff = handleCursorOff;
exports.handleCursorCancel = handleCursorCancel;
exports.handleCursorMessage = handleCursorMessage;
exports.recoverCursorTasks = recoverCursorTasks;
const tg_1 = require("../tg");
const emoji_1 = require("../emoji");
const cursor_1 = require("../cursor");
const db_1 = require("../db");
// Active conversation per admin (agent id). Seeded from DB on first use so the
// thread survives process restarts.
const session = new Map();
// Whether an admin explicitly reset the conversation and the next task must
// start a brand-new agent.
const forceNew = new Set();
// The task currently running per admin, so it can be cancelled.
const inFlight = new Map();
function isAdmin(userId) {
    return tg_1.ADMIN_IDS.includes(userId);
}
const NOT_CONFIGURED = `${(0, emoji_1.ce)('warning')} <b>Связь с Cursor не настроена.</b>\n\n` +
    `Добавь переменную окружения <code>CURSOR_API_KEY</code> (ключ из ` +
    `Cursor Dashboard → Integrations) и перезапусти бота. Репозиторий и ветка ` +
    `берутся из <code>CURSOR_REPO_URL</code> / <code>CURSOR_REPO_REF</code>.`;
// ── Commands ──────────────────────────────────────────────────────────────────
async function handleCursorCommand(userId, chatId, states) {
    if (!isAdmin(userId))
        return;
    if (!(0, cursor_1.cursorConfigured)()) {
        await (0, tg_1.sendMessage)(chatId, NOT_CONFIGURED);
        return;
    }
    states.set(userId, { step: 'cursor_mode' });
    const access = await (0, cursor_1.checkCursorRepoAccess)();
    if (!access.ok) {
        states.set(userId, { step: 'idle' });
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} ${access.message}`);
        return;
    }
    // Resume the previous conversation if one exists.
    if (!session.has(userId)) {
        const last = await (0, db_1.getLatestCursorAgent)(userId).catch(() => null);
        if (last)
            session.set(userId, last);
    }
    const continuing = session.has(userId) && !forceNew.has(userId);
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('rocket')} <b>Связь с Cursor включена.</b>\n\n` +
        `Отправляй задачу <b>текстом</b> или <b>фото</b> (можно с подписью) — изображение попадёт в Cursor.\n\n` +
        (continuing
            ? `${(0, emoji_1.ce)('bulb')} Продолжаю прошлый диалог. /cursor_new — начать новый.\n`
            : `${(0, emoji_1.ce)('bulb')} Будет начат новый диалог.\n`) +
        `\n<b>Управление:</b>\n` +
        `/cursor_new — новый диалог\n` +
        `/cursor_cancel — отменить текущую задачу\n` +
        `/cursor_off — выйти из режима`);
}
async function handleCursorNew(userId, chatId) {
    if (!isAdmin(userId))
        return;
    session.delete(userId);
    forceNew.add(userId);
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('spark')} Следующая задача начнёт новый диалог Cursor.`);
}
async function handleCursorOff(userId, chatId, states) {
    if (!isAdmin(userId))
        return;
    states.set(userId, { step: 'idle' });
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('check')} Режим Cursor выключен.`);
}
async function handleCursorCancel(userId, chatId) {
    if (!isAdmin(userId))
        return;
    const cur = inFlight.get(userId);
    if (!cur?.agentId || !cur.runId) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('bulb')} Сейчас нет запущенной задачи Cursor.`);
        return;
    }
    try {
        await (0, cursor_1.cancelCursorRun)(cur.agentId, cur.runId);
        inFlight.delete(userId);
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Отменяю текущую задачу Cursor…`);
    }
    catch (e) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Не удалось отменить: ${e.message}`);
    }
}
// ── Task dispatch ───────────────────────────────────────────────────────────
const PHOTO_ONLY_PROMPT = 'Пользователь отправил изображение без текста. Проанализируй его и выполни задачу, которую оно подразумевает.';
/** Accepts text, photo, or photo+ caption and forwards everything to Cursor. */
async function handleCursorMessage(userId, chatId, msg) {
    if (!isAdmin(userId))
        return;
    if (!(0, cursor_1.cursorConfigured)()) {
        await (0, tg_1.sendMessage)(chatId, NOT_CONFIGURED);
        return;
    }
    if (inFlight.has(userId)) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('alarm')} Cursor ещё работает над прошлой задачей. Дождись ответа или /cursor_cancel.`);
        return;
    }
    const hasImage = (0, tg_1.messageHasImage)(msg);
    const caption = (0, tg_1.getMessageText)(msg);
    if (!caption && !hasImage)
        return;
    let images;
    if (hasImage) {
        images = await (0, tg_1.downloadMessageImages)(msg);
        if (images.length === 0) {
            await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Не удалось загрузить изображение (макс. 5 МБ, форматы JPEG/PNG/WebP/GIF).`);
            return;
        }
    }
    const payload = {
        text: caption || PHOTO_ONLY_PROMPT,
        images,
    };
    const prevAgentId = forceNew.has(userId) ? null : session.get(userId) ?? null;
    const logPrompt = payload.text + (images?.length ? ` [+${images.length} image]` : '');
    const taskId = await (0, db_1.createCursorTask)(userId, chatId, logPrompt);
    inFlight.set(userId, { taskId });
    const imageNote = images?.length ? ` (+ ${images.length} фото)` : '';
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('rocket')} Задача отправлена в Cursor${imageNote}${prevAgentId ? ' (продолжение диалога)' : ' (новый диалог)'}.\n` +
        `${(0, emoji_1.ce)('alarm')} Работаю… пришлю ответ, как будет готово.`);
    void executeCursorTaskWork(userId, chatId, payload, prevAgentId, taskId).catch(err => {
        console.error('Cursor task failed:', err);
        inFlight.delete(userId);
        (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Внутренняя ошибка Cursor-задачи.`).catch(() => { });
    });
}
async function executeCursorTaskWork(userId, chatId, payload, prevAgentId, taskId) {
    try {
        const outcome = await (0, cursor_1.runCursorTask)(payload, prevAgentId, async (agentId, runId) => {
            session.set(userId, agentId);
            forceNew.delete(userId);
            inFlight.set(userId, { taskId, agentId, runId });
            await (0, db_1.setCursorTaskRun)(taskId, agentId, runId);
            await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('link')} Смотреть агента в Cursor:\n${(0, cursor_1.cursorAgentUrl)(agentId)}\n\n` +
                `${(0, emoji_1.ce)('bulb')} Это <b>Cloud Agent</b> — он не появится в списке локальных чатов слева.`).catch(() => { });
        });
        await (0, db_1.finishCursorTask)(taskId, outcome.status, outcome.result ?? null, outcome.prUrl ?? null);
        await deliverOutcome(chatId, outcome);
    }
    catch (e) {
        await (0, db_1.finishCursorTask)(taskId, 'error', (0, cursor_1.formatCursorError)(e), null);
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} <b>Ошибка запуска Cursor:</b>\n\n${(0, cursor_1.formatCursorError)(e)}`);
    }
    finally {
        inFlight.delete(userId);
    }
}
async function deliverOutcome(chatId, outcome) {
    if (outcome.status !== 'finished') {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Задача Cursor завершилась со статусом <b>${outcome.status}</b>.`);
        if (outcome.result)
            await (0, tg_1.sendPlain)(chatId, outcome.result);
        return;
    }
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('check')} <b>Ответ от Cursor:</b>`);
    await (0, tg_1.sendPlain)(chatId, outcome.result ?? '(агент не вернул текста)');
    if (outcome.prUrl) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('link')} Pull request: ${outcome.prUrl}\n\n` +
            `${(0, emoji_1.ce)('warning')} <b>Важно:</b> бот на Railway обновляется только после merge PR в <code>main</code>. ` +
            `Пока PR открыт — в боте старый код.`);
    }
}
// ── Crash recovery ────────────────────────────────────────────────────────────
/**
 * After a restart, re-attach to any task that was still running and deliver its
 * answer once it finishes. Runs in the background; never throws.
 */
async function recoverCursorTasks() {
    if (!(0, cursor_1.cursorConfigured)())
        return;
    let tasks;
    try {
        tasks = await (0, db_1.getRunningCursorTasks)();
    }
    catch {
        return;
    }
    for (const t of tasks) {
        if (!t.agent_id || !t.run_id)
            continue;
        const agentId = t.agent_id;
        const runId = t.run_id;
        (async () => {
            try {
                const outcome = await (0, cursor_1.awaitExistingRun)(agentId, runId);
                await (0, db_1.finishCursorTask)(t.id, outcome.status, outcome.result ?? null, outcome.prUrl ?? null);
                await deliverOutcome(t.chat_id, outcome);
            }
            catch (e) {
                await (0, db_1.finishCursorTask)(t.id, 'error', e.message, null).catch(() => { });
            }
        })();
    }
}
