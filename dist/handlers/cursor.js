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
exports.handleCursorTask = handleCursorTask;
exports.recoverCursorTasks = recoverCursorTasks;
const tg_1 = require("../tg");
const emoji_1 = require("../emoji");
const db_1 = require("../db");
const cursor_1 = require("../cursor");
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
    // Resume the previous conversation if one exists.
    if (!session.has(userId)) {
        const last = await (0, db_1.getLatestCursorAgent)(userId).catch(() => null);
        if (last)
            session.set(userId, last);
    }
    const continuing = session.has(userId) && !forceNew.has(userId);
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('rocket')} <b>Связь с Cursor включена.</b>\n\n` +
        `Пиши задачу обычным сообщением — отправлю её в Cursor (модель <b>Auto</b>, ` +
        `Cursor сам выберет нужный ИИ). По готовности пришлю ответ сюда.\n\n` +
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
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Отменяю текущую задачу Cursor…`);
    }
    catch (e) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Не удалось отменить: ${e.message}`);
    }
}
// ── Task dispatch ───────────────────────────────────────────────────────────
async function handleCursorTask(userId, chatId, text) {
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
    const prevAgentId = forceNew.has(userId) ? null : session.get(userId) ?? null;
    const taskId = await (0, db_1.createCursorTask)(userId, chatId, text);
    inFlight.set(userId, { taskId });
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('rocket')} Задача отправлена в Cursor${prevAgentId ? ' (продолжение диалога)' : ' (новый диалог)'}.\n` +
        `${(0, emoji_1.ce)('alarm')} Работаю… пришлю ответ, как будет готово.`);
    try {
        const outcome = await (0, cursor_1.runCursorTask)(text, prevAgentId, async (agentId, runId) => {
            session.set(userId, agentId);
            forceNew.delete(userId);
            inFlight.set(userId, { taskId, agentId, runId });
            await (0, db_1.setCursorTaskRun)(taskId, agentId, runId);
        });
        await (0, db_1.finishCursorTask)(taskId, outcome.status, outcome.result ?? null, outcome.prUrl ?? null);
        await deliverOutcome(chatId, outcome);
    }
    catch (e) {
        await (0, db_1.finishCursorTask)(taskId, 'error', e.message, null);
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} <b>Ошибка запуска Cursor:</b> ${e.message}\n\n` +
            `Проверь CURSOR_API_KEY и доступ ключа к репозиторию.`);
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
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('link')} Pull request: ${outcome.prUrl}`);
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
