// Premium (custom) emoji rendered via Telegram HTML <tg-emoji> tags.
//
// Requires the BOT OWNER's account to have an active Telegram Premium
// subscription (Bot API 9.4+). Works only in private/group/supergroup chats —
// NOT in channel posts. If the capability is ever unavailable, sendMessage /
// sendPhoto automatically fall back to the plain alt emoji (see tg.ts).
//
// IDs resolved from the owner's emoji sets via getStickerSet. Curated for a
// clean, varied "tool" look — each emoji carries a distinct meaning so messages
// don't repeat the same icon.

const E = {
  check:   { id: '5305417687357203905', alt: '✅' }, // Icon_2023 — confirmations / title
  ninja:   { id: '5321362835047985289', alt: '🥷' }, // cwdinfo — stealth: no "edited" mark
  noentry: { id: '5341513541700569186', alt: '🚫' }, // vector_basic_jaba — no ads/watermark
  bolt:    { id: '5303290914041505430', alt: '⚡' }, // Icon_2023 — speed
  chart:   { id: '5282734530547951466', alt: '📊' }, // AR_PREMIUM — analytics
  alarm:   { id: '4967525849902350972', alt: '⏰' }, // AnimatedIcon9 — scheduling
  rocket:  { id: '5868484743061834951', alt: '🚀' }, // iconemoji1 — call to action
  star:    { id: '5359726243145064513', alt: '⭐' }, // IconsEmoji — premium marker
  gem:     { id: '5271886843317590490', alt: '💎' }, // emojipremiumstatus — premium
  fire:    { id: '5377486534209446615', alt: '🔥' }, // bluerandom1 — hot / popular
  hand:    { id: '5978856151209480380', alt: '🤝' }, // iconemoji1 — referral
  spark:   { id: '5377321293932668025', alt: '✨' }, // bluerandom1 — clean / shiny
  link:    { id: '5377792383125561840', alt: '🔗' }, // bluerandom1 — links
  money:   { id: '5242532245087984921', alt: '💰' }, // Golden_Icons — earnings
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
