import { sendMessage } from '../tg';
import { ce } from '../emoji';
import { isPremium, setStatsEnabled, getUser, getUserTrackedLinks, getPostStats } from '../db';
import { parsePostLink } from '../parser';

// /stats — show analytics or toggle tracking
export async function handleStatsCommand(
  userId: number,
  chatId: number,
  arg: string,
): Promise<void> {
  const premium = await isPremium(userId);

  if (!premium) {
    await sendMessage(
      chatId,
      `${ce('chart')} <b>Аналитика кликов</b> — функция Premium.\n\n` +
        `Автоматически считает клики по каждой кнопке в твоих постах.\n\n` +
        `${ce('gem')} /premium — подключить`,
    );
    return;
  }

  const trimmed = arg.trim().toLowerCase();

  if (trimmed === 'on' || trimmed === 'вкл') {
    await setStatsEnabled(userId, true);
    await sendMessage(
      chatId,
      `${ce('eye')} <b>Отслеживание кликов включено!</b>\n\n` +
        `Теперь при /add все URL кнопок автоматически становятся отслеживаемыми.\n` +
        `Клики считаются и доступны по команде /stats`,
    );
    return;
  }

  if (trimmed === 'off' || trimmed === 'выкл') {
    await setStatsEnabled(userId, false);
    await sendMessage(chatId, `${ce('noentry')} Отслеживание кликов выключено.`);
    return;
  }

  // Show stats
  const user = await getUser(userId);
  const enabled = user?.stats_enabled ?? false;

  if (!enabled) {
    await sendMessage(
      chatId,
      `${ce('chart')} <b>Аналитика кликов</b>\n\nОтслеживание: <b>выключено</b>\n\nВключи командой <code>/stats on</code> — и каждая новая кнопка будет считать клики.`,
    );
    return;
  }

  const links = await getUserTrackedLinks(userId);
  if (links.length === 0) {
    await sendMessage(
      chatId,
      `${ce('chartup')} <b>Аналитика кликов</b>\n\nОтслеживание: <b>включено</b> ${ce('check')}\n\nДанных пока нет. Добавь кнопки командой /add — клики начнут считаться.`,
    );
    return;
  }

  const totalClicks = links.reduce((s, l) => s + l.clicks, 0);
  const lines = links
    .slice(0, 10)
    .map(l => {
      const postRef = `${l.post_chat_id}/${l.post_message_id}`;
      return `• <b>${l.button_label}</b> — ${l.clicks} кл. <i>(${postRef})</i>`;
    })
    .join('\n');

  await sendMessage(
    chatId,
    `${ce('chartup')} <b>Аналитика кликов</b>\n\nОтслеживание: <b>включено</b> ${ce('check')}\nВсего кликов: <b>${totalClicks}</b>\n\n${lines}` +
      (links.length > 10 ? `\n\n<i>и ещё ${links.length - 10}...</i>` : '') +
      `\n\n<b>Статистика по посту:</b> отправь /stats и ссылку на пост`,
  );
}

// /stats <post_link> — stats for specific post
export async function handlePostStats(
  userId: number,
  chatId: number,
  text: string,
): Promise<void> {
  const premium = await isPremium(userId);
  if (!premium) {
    await sendMessage(chatId, `${ce('gem')} Аналитика доступна в Premium. /premium`);
    return;
  }

  const parsed = parsePostLink(text);
  if (!parsed) {
    await sendMessage(chatId, `${ce('warning')} Не распознал ссылку на пост.`);
    return;
  }

  const links = await getPostStats(userId, String(parsed.chatId), parsed.messageId);
  if (links.length === 0) {
    await sendMessage(chatId, `${ce('chart')} По этому посту нет данных. Убедись, что кнопки добавлены с отслеживанием.`);
    return;
  }

  const total = links.reduce((s, l) => s + l.clicks, 0);
  const lines = links
    .map(l => `• <b>${l.button_label}</b>\n  ${l.clicks} кликов → <code>${l.original_url}</code>`)
    .join('\n\n');

  await sendMessage(
    chatId,
    `${ce('chartup')} <b>Статистика поста</b>\n\nВсего кликов: <b>${total}</b>\n\n${lines}`,
  );
}
