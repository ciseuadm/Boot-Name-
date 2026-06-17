"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUTTON_FORMAT_HELP = exports.NOT_CHANNEL_ADMIN = void 0;
exports.handleAddCommand = handleAddCommand;
exports.handleLinkAdd = handleLinkAdd;
exports.handleButtonsInput = handleButtonsInput;
const tg_1 = require("../tg");
const emoji_1 = require("../emoji");
const db_1 = require("../db");
const parser_1 = require("../parser");
exports.NOT_CHANNEL_ADMIN = `${(0, emoji_1.ce)('lock')} <b>Доступ запрещён.</b>\n\n` +
    `Управлять кнопками этого поста может только администратор канала. ` +
    `Добавь себя в админы канала или попроси владельца сделать это.`;
exports.BUTTON_FORMAT_HELP = `<b>Формат кнопок:</b>

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
async function handleAddCommand(userId, chatId, states, premium) {
    if (!premium) {
        const used = await (0, db_1.getDailyUsage)(userId);
        if (used >= db_1.FREE_DAILY_LIMIT) {
            await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} <b>Лимит исчерпан</b>\n\nБесплатный тариф: ${db_1.FREE_DAILY_LIMIT} применений кнопок в сутки.\nЛимит обновится через несколько часов.\n\n${(0, emoji_1.ce)('gem')} <b>Premium</b> снимает все ограничения.\n${(0, emoji_1.ce)('rocket')} /premium — подключить`);
            return;
        }
    }
    states.set(userId, { step: 'waiting_link_add' });
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('link')} Отправь ссылку на пост в канале.\n\n` +
        'Как получить: зайди в канал → зажми пост → <b>Скопировать ссылку</b>\n\n' +
        '/cancel — отмена');
}
async function handleLinkAdd(userId, chatId, text, states) {
    const { parsePostLink } = await Promise.resolve().then(() => __importStar(require('../parser')));
    const parsed = parsePostLink(text);
    if (!parsed) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Не распознал ссылку.\n\n` +
            'Ожидаю формат:\n' +
            '<code>https://t.me/канал/42</code> — публичный\n' +
            '<code>https://t.me/c/1234567890/42</code> — приватный\n\n' +
            '/cancel — отмена');
        return;
    }
    if (!(await (0, tg_1.isChatAdmin)(parsed.chatId, userId))) {
        states.set(userId, { step: 'idle' });
        await (0, tg_1.sendMessage)(chatId, exports.NOT_CHANNEL_ADMIN);
        return;
    }
    const maxButtons = (await (0, db_1.isPremium)(userId)) ? db_1.PREMIUM_MAX_BUTTONS : db_1.FREE_MAX_BUTTONS;
    const premium = await (0, db_1.isPremium)(userId);
    states.set(userId, {
        step: 'waiting_buttons',
        chatId: parsed.chatId,
        messageId: parsed.messageId,
    });
    const limitNote = premium
        ? `до ${db_1.PREMIUM_MAX_BUTTONS} кнопок`
        : `до ${db_1.FREE_MAX_BUTTONS} кнопок (Free). <a href="tg://resolve?domain=">Premium</a> — до ${db_1.PREMIUM_MAX_BUTTONS}`;
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('radio')} Пост найден! (${limitNote})\n\n${exports.BUTTON_FORMAT_HELP}\n\nОтправь кнопки 👇\n\n/cancel — отмена`);
}
async function handleButtonsInput(userId, chatId, text, state, states) {
    const premium = await (0, db_1.isPremium)(userId);
    const maxButtons = premium ? db_1.PREMIUM_MAX_BUTTONS : db_1.FREE_MAX_BUTTONS;
    const rows = (0, parser_1.parseButtons)(text, maxButtons);
    if (!rows) {
        const limit = premium ? db_1.PREMIUM_MAX_BUTTONS : db_1.FREE_MAX_BUTTONS;
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Не смог разобрать кнопки.\n\nПроверь формат или лимит (макс. ${limit} кнопок).\n\n${exports.BUTTON_FORMAT_HELP}\n\n/cancel — отмена`);
        return;
    }
    const { chatId: postChatId, messageId } = state;
    states.set(userId, { step: 'idle' });
    try {
        const markup = {
            inline_keyboard: rows.map(row => row.map((b) => ({ text: b.text, url: b.url }))),
        };
        await (0, tg_1.editMarkup)(postChatId, messageId, markup);
        await (0, db_1.logUsage)(userId, 'add_buttons');
        const total = rows.reduce((s, r) => s + r.length, 0);
        const preview = (0, parser_1.formatButtonPreview)(rows);
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('check')} Готово! Добавил ${total} ${btnWord(total)}:\n\n<code>${preview}</code>\n\n${(0, emoji_1.ce)('dividers')} Сохранить как шаблон: /save`);
    }
    catch (e) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Ошибка: ${e.message}\n\nУбедись, что:\n• Бот — администратор канала\n• Есть право <i>Редактировать сообщения</i>\n• Ссылка ведёт на верный пост`);
    }
}
function btnWord(n) {
    if (n % 10 === 1 && n % 100 !== 11)
        return 'кнопку';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20))
        return 'кнопки';
    return 'кнопок';
}
