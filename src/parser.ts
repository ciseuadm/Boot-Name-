import { escapeHtml } from './tg';

export interface ParsedLink {
  chatId: string | number;
  messageId: number;
}

// Telegram caps inline-button text at 64 chars and URLs well under 2048; reject
// anything wildly out of range early so we fail with a clear message instead of
// an opaque Telegram API error (and don't forward absurd payloads upstream).
const MAX_BTN_TEXT = 64;
const MAX_BTN_URL = 2048;

export interface InlineButton {
  text: string;
  url: string;
}

/**
 * Parse a Telegram post link into chatId + messageId.
 * Supports:
 *   Public:  https://t.me/channelname/42
 *   Private: https://t.me/c/1234567890/42
 */
export function parsePostLink(input: string): ParsedLink | null {
  const clean = input.trim();

  const privateMatch = clean.match(/t\.me\/c\/(\d+)\/(\d+)/);
  if (privateMatch) {
    return {
      chatId: parseInt(`-100${privateMatch[1]!}`, 10),
      messageId: parseInt(privateMatch[2]!, 10),
    };
  }

  const publicMatch = clean.match(/t\.me\/([A-Za-z0-9_]+)\/(\d+)/);
  if (publicMatch) {
    return {
      chatId: `@${publicMatch[1]!}`,
      messageId: parseInt(publicMatch[2]!, 10),
    };
  }

  return null;
}

/**
 * Parse button layout from user text.
 *
 * Format:
 *   - Each LINE becomes one ROW of buttons.
 *   - Within a line, buttons are defined as alternating Text | URL pairs:
 *       Button1 | https://url1 | Button2 | https://url2
 *   - Empty lines are ignored.
 *
 * maxButtons: 6 for free users, 20 for premium.
 * Returns null if the format is invalid.
 */
export function parseButtons(text: string, maxButtons = 20): InlineButton[][] | null {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return null;

  const rows: InlineButton[][] = [];
  let totalButtons = 0;

  for (const line of lines) {
    const parts = line.split('|').map(p => p.trim());

    if (parts.length < 2 || parts.length % 2 !== 0) {
      return null;
    }

    const row: InlineButton[] = [];
    for (let i = 0; i < parts.length; i += 2) {
      const btnText = parts[i]!;
      const btnUrl  = parts[i + 1]!;

      if (!btnText || btnText.length > MAX_BTN_TEXT) return null;
      // Only real web links: blocks javascript:/tg:/data: and stray text.
      if (!/^https?:\/\/\S+$/i.test(btnUrl) || btnUrl.length > MAX_BTN_URL) return null;

      row.push({ text: btnText, url: btnUrl });
      totalButtons++;

      if (totalButtons > maxButtons) return null;
    }

    if (row.length > 8) return null;

    rows.push(row);
  }

  return rows;
}

/**
 * Format a button layout back to readable text for confirmation preview.
 * The result is always rendered inside an HTML <code> block, so button text
 * (user-controlled) must be escaped to avoid breaking/injecting markup.
 */
export function formatButtonPreview(rows: InlineButton[][]): string {
  return rows
    .map(row => row.map(b => `[${escapeHtml(b.text)}]`).join(' '))
    .join('\n');
}
