// Premium (custom) emoji rendered via Telegram HTML <tg-emoji> tags.
//
// Requires the BOT OWNER's account to have an active Telegram Premium
// subscription (Bot API 9.4+). Works only in private/group/supergroup chats —
// NOT in channel posts. If the capability is ever unavailable, sendMessage /
// sendPhoto automatically fall back to the plain alt emoji (see tg.ts).
//
// IDs resolved from the owner's emoji sets via getStickerSet. Blue-themed picks
// match the bot's neon avatar; star/gem come from the premium-status set.

const E = {
  check:  { id: '5379666011068835203', alt: '✅' },
  bolt:   { id: '5377834924776627189', alt: '⚡' },
  fire:   { id: '5377486534209446615', alt: '🔥' },
  spark:  { id: '5377321293932668025', alt: '✨' },
  star:   { id: '5271725786338961325', alt: '⭐' },
  hand:   { id: '5978856151209480380', alt: '🤝' },
  gem:    { id: '5271886843317590490', alt: '💎' },
  rocket: { id: '5352842574505715880', alt: '🚀' },
  cross:  { id: '5377399483812290165', alt: '❌' },
} as const;

export type EmojiName = keyof typeof E;

/** Returns an HTML <tg-emoji> tag for the named premium emoji. */
export function ce(name: EmojiName): string {
  const e = E[name];
  return `<tg-emoji emoji-id="${e.id}">${e.alt}</tg-emoji>`;
}

/** Replace <tg-emoji> tags with their plain alt emoji (fallback path). */
export function stripCustomEmoji(html: string): string {
  return html.replace(/<tg-emoji[^>]*>(.*?)<\/tg-emoji>/g, '$1');
}
