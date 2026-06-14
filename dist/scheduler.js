"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("./db");
const tg_1 = require("./tg");
const parser_1 = require("./parser");
const db_2 = require("./db");
function startScheduler() {
    // Run every minute
    node_cron_1.default.schedule('* * * * *', async () => {
        try {
            const tasks = await (0, db_1.getPendingTasks)();
            for (const task of tasks) {
                await runTask(task.id, task.user_id, task.post_chat_id, task.post_message_id, task.buttons_text);
            }
        }
        catch (e) {
            console.error('Scheduler error:', e);
        }
    });
    console.log('Scheduler started');
}
async function runTask(id, userId, postChatId, postMessageId, buttonsText) {
    try {
        const rows = (0, parser_1.parseButtons)(buttonsText, db_2.PREMIUM_MAX_BUTTONS);
        if (!rows) {
            await (0, db_1.markTaskFailed)(id, 'Failed to parse buttons text');
            return;
        }
        const markup = {
            inline_keyboard: rows.map(row => row.map((b) => ({ text: b.text, url: b.url }))),
        };
        await (0, tg_1.editMarkup)(postChatId, postMessageId, markup);
        await (0, db_1.markTaskDone)(id);
        await (0, tg_1.sendMessage)(userId, `✅ Отложенная задача выполнена!\n\nКнопки добавлены к посту ${postChatId}/${postMessageId}.`).catch(() => { });
    }
    catch (e) {
        const errMsg = e.message;
        await (0, db_1.markTaskFailed)(id, errMsg);
        await (0, tg_1.sendMessage)(userId, `❌ Ошибка отложенной задачи #${id}:\n${errMsg}\n\nУбедись, что бот — администратор канала.`).catch(() => { });
    }
}
