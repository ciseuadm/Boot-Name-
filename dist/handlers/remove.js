"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRemoveCommand = handleRemoveCommand;
exports.handleLinkRemove = handleLinkRemove;
const tg_1 = require("../tg");
const parser_1 = require("../parser");
async function handleRemoveCommand(userId, chatId, states) {
    states.set(userId, { step: 'waiting_link_remove' });
    await (0, tg_1.sendMessage)(chatId, '🔗 Отправь ссылку на пост, с которого нужно убрать кнопки.\n\n❌ /cancel — отмена');
}
async function handleLinkRemove(userId, chatId, text, states) {
    const parsed = (0, parser_1.parsePostLink)(text);
    if (!parsed) {
        await (0, tg_1.sendMessage)(chatId, '❌ Не распознал ссылку. Попробуй ещё раз.\n\n❌ /cancel — отмена');
        return;
    }
    states.set(userId, { step: 'idle' });
    try {
        await (0, tg_1.editMarkup)(parsed.chatId, parsed.messageId, null);
        await (0, tg_1.sendMessage)(chatId, '✅ Кнопки убраны с поста!');
    }
    catch (e) {
        await (0, tg_1.sendMessage)(chatId, `❌ Ошибка: ${e.message}\n\nУбедись, что бот — администратор канала с правом редактировать сообщения.`);
    }
}
