"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTemplatesCommand = handleTemplatesCommand;
exports.handleSaveCommand = handleSaveCommand;
exports.handleTemplateName = handleTemplateName;
exports.handleTemplateButtonsSave = handleTemplateButtonsSave;
exports.handleApplyCommand = handleApplyCommand;
exports.handleTemplateApplyLink = handleTemplateApplyLink;
exports.handleDeleteTemplate = handleDeleteTemplate;
exports.handleTemplateDeleteName = handleTemplateDeleteName;
const tg_1 = require("../tg");
const add_1 = require("./add");
const db_1 = require("../db");
const parser_1 = require("../parser");
const db_2 = require("../db");
const emoji_1 = require("../emoji");
// ── /templates ───────────────────────────────────────────────────────────────
async function handleTemplatesCommand(userId, chatId, states) {
    const premium = await (0, db_1.isPremium)(userId);
    const templates = await (0, db_1.getTemplates)(userId);
    if (templates.length === 0) {
        const hint = premium
            ? `${(0, emoji_1.ce)('bulb')} У тебя пока нет шаблонов.\n\nСохрани набор кнопок командой <code>/save Название</code> после команды /add.`
            : `${(0, emoji_1.ce)('bulb')} У тебя пока нет шаблонов.\n\n${(0, emoji_1.ce)('gem')} <b>Premium</b> — до ${db_1.PREMIUM_MAX_TEMPLATES} шаблонов. <b>Free</b> — до ${db_1.FREE_MAX_TEMPLATES}.\n\nСохрани набор кнопок: /add → добавь кнопки → потом <code>/save Название</code>`;
        await (0, tg_1.sendMessage)(chatId, hint);
        return;
    }
    const lines = templates.map((t, i) => `${i + 1}. <b>${t.name}</b>`).join('\n');
    const maxLabel = premium ? db_1.PREMIUM_MAX_TEMPLATES : db_1.FREE_MAX_TEMPLATES;
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('dividers')} <b>Твои шаблоны</b> (${templates.length}/${maxLabel}):\n\n${lines}\n\n` +
        `Применить: <code>/apply Название</code>\n` +
        `Удалить: <code>/del Название</code>`);
}
// ── /save ────────────────────────────────────────────────────────────────────
async function handleSaveCommand(userId, chatId, arg, states) {
    const premium = await (0, db_1.isPremium)(userId);
    const count = await (0, db_1.countTemplates)(userId);
    const maxT = premium ? db_1.PREMIUM_MAX_TEMPLATES : db_1.FREE_MAX_TEMPLATES;
    if (count >= maxT) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Лимит шаблонов: ${maxT}.\n${premium ? 'Удали ненужный шаблон командой /del.' : (0, emoji_1.ce)('gem') + ' /premium — до ' + db_1.PREMIUM_MAX_TEMPLATES + ' шаблонов'}`);
        return;
    }
    const name = arg.trim();
    if (!name) {
        states.set(userId, { step: 'waiting_template_name_save' });
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('pencil')} Как назвать шаблон? Введи название:\n\n/cancel — отмена`);
        return;
    }
    states.set(userId, { step: 'waiting_template_buttons_save', name });
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('puzzle')} Отправь кнопки для шаблона <b>"${name}"</b>:\n\nФормат: <code>Текст | URL</code> (каждая строка — ряд)\n\n/cancel — отмена`);
}
async function handleTemplateName(userId, chatId, name, states) {
    const premium = await (0, db_1.isPremium)(userId);
    const count = await (0, db_1.countTemplates)(userId);
    const maxT = premium ? db_1.PREMIUM_MAX_TEMPLATES : db_1.FREE_MAX_TEMPLATES;
    if (count >= maxT) {
        states.set(userId, { step: 'idle' });
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Лимит шаблонов: ${maxT}. Удали ненужный командой /del.`);
        return;
    }
    states.set(userId, { step: 'waiting_template_buttons_save', name });
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('puzzle')} Отправь кнопки для шаблона <b>"${name}"</b>:\n\nФормат: <code>Текст | URL</code>\n\n/cancel — отмена`);
}
async function handleTemplateButtonsSave(userId, chatId, text, name, states) {
    const premium = await (0, db_1.isPremium)(userId);
    const maxButtons = premium ? db_2.PREMIUM_MAX_BUTTONS : db_2.FREE_MAX_BUTTONS;
    const rows = (0, parser_1.parseButtons)(text, maxButtons);
    if (!rows) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Не смог разобрать кнопки. Проверь формат (макс. ${maxButtons} кнопок).\n\n/cancel — отмена`);
        return;
    }
    await (0, db_1.saveTemplate)(userId, name, text);
    states.set(userId, { step: 'idle' });
    const preview = (0, parser_1.formatButtonPreview)(rows);
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('check')} Шаблон <b>"${name}"</b> сохранён!\n\n<code>${preview}</code>\n\nПрименить: <code>/apply ${name}</code>`);
}
// ── /apply ───────────────────────────────────────────────────────────────────
async function handleApplyCommand(userId, chatId, arg, states) {
    if (!arg.trim()) {
        const templates = await (0, db_1.getTemplates)(userId);
        if (templates.length === 0) {
            await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('bulb')} У тебя нет шаблонов. Создай шаблон командой /save.`);
            return;
        }
        const list = templates.map(t => `• <code>/apply ${t.name}</code>`).join('\n');
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('dividers')} Твои шаблоны:\n\n${list}`);
        return;
    }
    const name = arg.trim();
    const template = await (0, db_1.getTemplate)(userId, name);
    if (!template) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Шаблон <b>"${name}"</b> не найден.\n\nПосмотри список: /templates`);
        return;
    }
    states.set(userId, { step: 'waiting_template_apply_link', templateName: template.name });
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('pushpin')} Шаблон <b>"${template.name}"</b> выбран.\n\n${(0, emoji_1.ce)('link')} Теперь отправь ссылку на пост:\n\n/cancel — отмена`);
}
async function handleTemplateApplyLink(userId, chatId, text, templateName, states) {
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
    const template = await (0, db_1.getTemplate)(userId, templateName);
    if (!template) {
        states.set(userId, { step: 'idle' });
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Шаблон не найден. Возможно, был удалён.`);
        return;
    }
    const premium = await (0, db_1.isPremium)(userId);
    if (!premium) {
        const used = await (0, db_1.getDailyUsage)(userId);
        if (used >= db_1.FREE_DAILY_LIMIT) {
            states.set(userId, { step: 'idle' });
            await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('warning')} Дневной лимит (${db_1.FREE_DAILY_LIMIT}) исчерпан.\n${(0, emoji_1.ce)('gem')} /premium — безлимит`);
            return;
        }
    }
    const maxButtons = premium ? db_2.PREMIUM_MAX_BUTTONS : db_2.FREE_MAX_BUTTONS;
    const rows = (0, parser_1.parseButtons)(template.buttons_text, maxButtons);
    if (!rows) {
        states.set(userId, { step: 'idle' });
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Шаблон повреждён. Пересохрани его командой /save.`);
        return;
    }
    states.set(userId, { step: 'idle' });
    try {
        const markup = {
            inline_keyboard: rows.map(row => row.map((b) => ({ text: b.text, url: b.url }))),
        };
        await (0, tg_1.editMarkup)(parsed.chatId, parsed.messageId, markup);
        await (0, db_1.logUsage)(userId, 'add_buttons');
        const total = rows.reduce((s, r) => s + r.length, 0);
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('check')} Шаблон <b>"${template.name}"</b> применён! (${total} ${btnWord(total)})`);
    }
    catch (e) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Ошибка: ${e.message}\n\nУбедись, что бот — администратор канала.`);
    }
}
// ── /del ─────────────────────────────────────────────────────────────────────
async function handleDeleteTemplate(userId, chatId, arg, states) {
    if (!arg.trim()) {
        states.set(userId, { step: 'waiting_template_delete_name' });
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('trash')} Введи название шаблона для удаления:\n\n/cancel — отмена`);
        return;
    }
    await doDeleteTemplate(userId, chatId, arg.trim(), states);
}
async function handleTemplateDeleteName(userId, chatId, name, states) {
    await doDeleteTemplate(userId, chatId, name, states);
}
async function doDeleteTemplate(userId, chatId, name, states) {
    states.set(userId, { step: 'idle' });
    const deleted = await (0, db_1.deleteTemplate)(userId, name);
    if (deleted) {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('check')} Шаблон <b>"${name}"</b> удалён.`);
    }
    else {
        await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('cross')} Шаблон <b>"${name}"</b> не найден.\n\nСписок шаблонов: /templates`);
    }
}
function btnWord(n) {
    if (n % 10 === 1 && n % 100 !== 11)
        return 'кнопку';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20))
        return 'кнопки';
    return 'кнопок';
}
