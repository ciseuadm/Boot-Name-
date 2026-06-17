import { sendMessage, editMarkup, isChatAdmin } from '../tg';
import { NOT_CHANNEL_ADMIN } from './add';
import {
  getTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
  countTemplates,
  isPremium,
  logUsage,
  getDailyUsage,
  FREE_DAILY_LIMIT,
  FREE_MAX_TEMPLATES,
  PREMIUM_MAX_TEMPLATES,
} from '../db';
import { parsePostLink, parseButtons, formatButtonPreview, InlineButton } from '../parser';
import { FREE_MAX_BUTTONS, PREMIUM_MAX_BUTTONS } from '../db';
import { ce } from '../emoji';
import type { UserState } from '../bot';

// ── /templates ───────────────────────────────────────────────────────────────

export async function handleTemplatesCommand(
  userId: number,
  chatId: number,
  states: Map<number, UserState>,
): Promise<void> {
  const premium = await isPremium(userId);
  const templates = await getTemplates(userId);

  if (templates.length === 0) {
    const hint = premium
      ? `${ce('bulb')} У тебя пока нет шаблонов.\n\nСохрани набор кнопок командой <code>/save Название</code> после команды /add.`
      : `${ce('bulb')} У тебя пока нет шаблонов.\n\n${ce('gem')} <b>Premium</b> — до ${PREMIUM_MAX_TEMPLATES} шаблонов. <b>Free</b> — до ${FREE_MAX_TEMPLATES}.\n\nСохрани набор кнопок: /add → добавь кнопки → потом <code>/save Название</code>`;
    await sendMessage(chatId, hint);
    return;
  }

  const lines = templates.map((t, i) => `${i + 1}. <b>${t.name}</b>`).join('\n');
  const maxLabel = premium ? PREMIUM_MAX_TEMPLATES : FREE_MAX_TEMPLATES;
  await sendMessage(
    chatId,
    `${ce('dividers')} <b>Твои шаблоны</b> (${templates.length}/${maxLabel}):\n\n${lines}\n\n` +
      `Применить: <code>/apply Название</code>\n` +
      `Удалить: <code>/del Название</code>`,
  );
}

// ── /save ────────────────────────────────────────────────────────────────────

export async function handleSaveCommand(
  userId: number,
  chatId: number,
  arg: string,
  states: Map<number, UserState>,
): Promise<void> {
  const premium = await isPremium(userId);
  const count = await countTemplates(userId);
  const maxT = premium ? PREMIUM_MAX_TEMPLATES : FREE_MAX_TEMPLATES;

  if (count >= maxT) {
    await sendMessage(
      chatId,
      `${ce('warning')} Лимит шаблонов: ${maxT}.\n${
        premium ? 'Удали ненужный шаблон командой /del.' : ce('gem') + ' /premium — до ' + PREMIUM_MAX_TEMPLATES + ' шаблонов'
      }`,
    );
    return;
  }

  const name = arg.trim();
  if (!name) {
    states.set(userId, { step: 'waiting_template_name_save' });
    await sendMessage(chatId, `${ce('pencil')} Как назвать шаблон? Введи название:\n\n/cancel — отмена`);
    return;
  }

  states.set(userId, { step: 'waiting_template_buttons_save', name });
  await sendMessage(
    chatId,
    `${ce('puzzle')} Отправь кнопки для шаблона <b>"${name}"</b>:\n\nФормат: <code>Текст | URL</code> (каждая строка — ряд)\n\n/cancel — отмена`,
  );
}

export async function handleTemplateName(
  userId: number,
  chatId: number,
  name: string,
  states: Map<number, UserState>,
): Promise<void> {
  const premium = await isPremium(userId);
  const count = await countTemplates(userId);
  const maxT = premium ? PREMIUM_MAX_TEMPLATES : FREE_MAX_TEMPLATES;

  if (count >= maxT) {
    states.set(userId, { step: 'idle' });
    await sendMessage(chatId, `${ce('warning')} Лимит шаблонов: ${maxT}. Удали ненужный командой /del.`);
    return;
  }

  states.set(userId, { step: 'waiting_template_buttons_save', name });
  await sendMessage(
    chatId,
    `${ce('puzzle')} Отправь кнопки для шаблона <b>"${name}"</b>:\n\nФормат: <code>Текст | URL</code>\n\n/cancel — отмена`,
  );
}

export async function handleTemplateButtonsSave(
  userId: number,
  chatId: number,
  text: string,
  name: string,
  states: Map<number, UserState>,
): Promise<void> {
  const premium = await isPremium(userId);
  const maxButtons = premium ? PREMIUM_MAX_BUTTONS : FREE_MAX_BUTTONS;
  const rows = parseButtons(text, maxButtons);

  if (!rows) {
    await sendMessage(
      chatId,
      `${ce('warning')} Не смог разобрать кнопки. Проверь формат (макс. ${maxButtons} кнопок).\n\n/cancel — отмена`,
    );
    return;
  }

  await saveTemplate(userId, name, text);
  states.set(userId, { step: 'idle' });
  const preview = formatButtonPreview(rows);
  await sendMessage(
    chatId,
    `${ce('check')} Шаблон <b>"${name}"</b> сохранён!\n\n<code>${preview}</code>\n\nПрименить: <code>/apply ${name}</code>`,
  );
}

// ── /apply ───────────────────────────────────────────────────────────────────

export async function handleApplyCommand(
  userId: number,
  chatId: number,
  arg: string,
  states: Map<number, UserState>,
): Promise<void> {
  if (!arg.trim()) {
    const templates = await getTemplates(userId);
    if (templates.length === 0) {
      await sendMessage(chatId, `${ce('bulb')} У тебя нет шаблонов. Создай шаблон командой /save.`);
      return;
    }
    const list = templates.map(t => `• <code>/apply ${t.name}</code>`).join('\n');
    await sendMessage(chatId, `${ce('dividers')} Твои шаблоны:\n\n${list}`);
    return;
  }

  const name = arg.trim();
  const template = await getTemplate(userId, name);
  if (!template) {
    await sendMessage(chatId, `${ce('cross')} Шаблон <b>"${name}"</b> не найден.\n\nПосмотри список: /templates`);
    return;
  }

  states.set(userId, { step: 'waiting_template_apply_link', templateName: template.name });
  await sendMessage(
    chatId,
    `${ce('pushpin')} Шаблон <b>"${template.name}"</b> выбран.\n\n${ce('link')} Теперь отправь ссылку на пост:\n\n/cancel — отмена`,
  );
}

export async function handleTemplateApplyLink(
  userId: number,
  chatId: number,
  text: string,
  templateName: string,
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

  const template = await getTemplate(userId, templateName);
  if (!template) {
    states.set(userId, { step: 'idle' });
    await sendMessage(chatId, `${ce('cross')} Шаблон не найден. Возможно, был удалён.`);
    return;
  }

  const premium = await isPremium(userId);
  if (!premium) {
    const used = await getDailyUsage(userId);
    if (used >= FREE_DAILY_LIMIT) {
      states.set(userId, { step: 'idle' });
      await sendMessage(
        chatId,
        `${ce('warning')} Дневной лимит (${FREE_DAILY_LIMIT}) исчерпан.\n${ce('gem')} /premium — безлимит`,
      );
      return;
    }
  }

  const maxButtons = premium ? PREMIUM_MAX_BUTTONS : FREE_MAX_BUTTONS;
  const rows = parseButtons(template.buttons_text, maxButtons);
  if (!rows) {
    states.set(userId, { step: 'idle' });
    await sendMessage(chatId, `${ce('cross')} Шаблон повреждён. Пересохрани его командой /save.`);
    return;
  }

  states.set(userId, { step: 'idle' });

  try {
    const markup = {
      inline_keyboard: rows.map(row =>
        row.map((b: InlineButton) => ({ text: b.text, url: b.url })),
      ),
    };
    await editMarkup(parsed.chatId, parsed.messageId, markup);
    await logUsage(userId, 'add_buttons');
    const total = rows.reduce((s, r) => s + r.length, 0);
    await sendMessage(
      chatId,
      `${ce('check')} Шаблон <b>"${template.name}"</b> применён! (${total} ${btnWord(total)})`,
    );
  } catch (e) {
    await sendMessage(
      chatId,
      `${ce('cross')} Ошибка: ${(e as Error).message}\n\nУбедись, что бот — администратор канала.`,
    );
  }
}

// ── /del ─────────────────────────────────────────────────────────────────────

export async function handleDeleteTemplate(
  userId: number,
  chatId: number,
  arg: string,
  states: Map<number, UserState>,
): Promise<void> {
  if (!arg.trim()) {
    states.set(userId, { step: 'waiting_template_delete_name' });
    await sendMessage(chatId, `${ce('trash')} Введи название шаблона для удаления:\n\n/cancel — отмена`);
    return;
  }
  await doDeleteTemplate(userId, chatId, arg.trim(), states);
}

export async function handleTemplateDeleteName(
  userId: number,
  chatId: number,
  name: string,
  states: Map<number, UserState>,
): Promise<void> {
  await doDeleteTemplate(userId, chatId, name, states);
}

async function doDeleteTemplate(
  userId: number,
  chatId: number,
  name: string,
  states: Map<number, UserState>,
): Promise<void> {
  states.set(userId, { step: 'idle' });
  const deleted = await deleteTemplate(userId, name);
  if (deleted) {
    await sendMessage(chatId, `${ce('check')} Шаблон <b>"${name}"</b> удалён.`);
  } else {
    await sendMessage(chatId, `${ce('cross')} Шаблон <b>"${name}"</b> не найден.\n\nСписок шаблонов: /templates`);
  }
}

function btnWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'кнопку';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'кнопки';
  return 'кнопок';
}
