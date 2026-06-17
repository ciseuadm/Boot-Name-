"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRemoveCommand = handleRemoveCommand;
exports.handleLinkRemove = handleLinkRemove;
const tg_1 = require("../tg");
const emoji_1 = require("../emoji");
const parser_1 = require("../parser");
const add_1 = require("./add");
async function handleRemoveCommand(userId, chatId, states) {
    states.set(userId, { step: 'waiting_link_remove' });
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('link')} Отправь ссылку на пост, с которого нужно убрать кнопки.\n\n/cancel — отмена`);
}
async function handleLinkRemove(userId, chatId, text, states) {
    const parsed = (0, parser_1.parsePostLink)(text);
    if (!parsed) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Не распознал ссылку. Попробуй ещё раз.\n\n/cancel — отмена`);
        return;
    }
    if (!(await (0, tg_1.isChatAdmin)(parsed.chatId, userId))) {
        states.set(userId, { step: 'idle' });
        await (0, tg_1.sendMessage)(chatId, add_1.NOT_CHANNEL_ADMIN);
        return;
    }
    states.set(userId, { step: 'idle' });
    try {
        await (0, tg_1.editMarkup)(parsed.chatId, parsed.messageId, null);
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('trash')} Кнопки убраны с поста!`);
    }
    catch (e) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Ошибка: ${e.message}\n\nУбедись, что бот — администратор канала с правом редактировать сообщения.`);
    }
}
