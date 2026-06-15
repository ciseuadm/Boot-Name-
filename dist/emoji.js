"use strict";
// Premium (custom) emoji rendered via Telegram HTML <tg-emoji> tags.
//
// Requires the BOT OWNER's account to have an active Telegram Premium
// subscription (Bot API 9.4+). Works only in private/group/supergroup chats —
// NOT in channel posts. If the capability is ever unavailable, sendMessage /
// sendPhoto automatically fall back to the plain alt emoji (see tg.ts).
//
// Curated to match the neon-blue/purple avatar (mostly bluerandom1 / purplerandom).
// Each concept has a distinct icon so messages never repeat the same emoji.
// `cp` is the alt emoji code point — using fromCodePoint guarantees the exact
// base scalar (no variation selector), which must match the custom emoji's alt.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ce = ce;
exports.stripCustomEmoji = stripCustomEmoji;
// All icons below are from the TrendingRaidar premium set — a cohesive neon
// "trending" pack that matches the bot's dark-neon avatar/banner. Each concept
// maps to the closest-fitting glyph in that single set so the whole bot shares
// one consistent visual language. `cp` / `alt` is the exact alt scalar of the
// chosen sticker (must match, incl. any U+FE0F variation selector / keycaps).
const E = {
    check: { id: '5778450623536043224', cp: 0x2705 }, // ✅ success / confirm
    bolt: { id: '5778322642100558247', alt: '\u26A1\uFE0F' }, // ⚡ speed
    ninja: { id: '5767392255274915656', cp: 0x1F6E1 }, // 🛡 no traces / unchanged
    noentry: { id: '5780515922984835359', cp: 0x274C }, // ❌ no ads / watermark
    chart: { id: '5778154657339676520', cp: 0x1F4CA }, // 📊 analytics
    chartup: { id: '5780814040959818245', cp: 0x1F4C8 }, // 📈 stats growth
    alarm: { id: '5778480967479990908', cp: 0x23F0 }, // ⏰ scheduling
    rocket: { id: '5778230072670427367', cp: 0x1F680 }, // 🚀 call to action
    plus: { id: '5800903050407188061', cp: 0x2795 }, // ➕ add
    trash: { id: '5789811164221282489', cp: 0x2796 }, // ➖ remove / delete
    dividers: { id: '5787492135284512666', cp: 0x1F4CB }, // 📋 templates list
    gem: { id: '5778484639677028654', cp: 0x1F3C6 }, // 🏆 premium
    star: { id: '5787295065005103877', alt: '\u2B50\uFE0F' }, // ⭐ plan / highlight
    crown: { id: '5780686892747986518', cp: 0x1F984 }, // 🦄 premium active (rare)
    handshake: { id: '5780582791330667024', cp: 0x1F310 }, // 🌐 referral / network
    gift: { id: '5789830590358362852', cp: 0x1F381 }, // 🎁 bonus
    people: { id: '5778354210110183831', cp: 0x1F464 }, // 👤 referrals count
    question: { id: '5798550894387664277', cp: 0x2754 }, // ❓ help
    book: { id: '5778246582524713423', alt: '\u2139\uFE0F' }, // ℹ️ reference / info
    bulb: { id: '5778357804997810086', cp: 0x1F4AC }, // 💬 hint / tip
    link: { id: '5787306390833862600', cp: 0x1F517 }, // 🔗 send link
    fire: { id: '5776025298453666377', cp: 0x1F525 }, // 🔥 hot / hook
    warning: { id: '5778621271176648643', alt: '\u26A0\uFE0F' }, // ⚠️ limit / caution
    cross: { id: '5787240918352402233', alt: '\u2716\uFE0F' }, // ✖️ error / cancel
    radio: { id: '5823381685168773423', cp: 0x1F518 }, // 🔘 button / post found
    pushpin: { id: '5780717932476635115', cp: 0x1F516 }, // 🔖 apply template
    pencil: { id: '5778147033772726447', cp: 0x1F195 }, // 🆕 new / input
    puzzle: { id: '5778371432929041838', cp: 0x1F535 }, // 🔵 assemble buttons
    eye: { id: '5780472213102663642', cp: 0x1F441 }, // 👁 tracking on
    bell: { id: '5780772031884695993', cp: 0x23F3 }, // ⏳ timer / wait
    megaphone: { id: '5787596309716277103', cp: 0x1F4E3 }, // 📣 broadcast / share
    money: { id: '5778660595897211318', cp: 0x1FA99 }, // 🪙 payment
    lock: { id: '5778670452847155016', cp: 0x1F510 }, // 🔐 admin
    key: { id: '5780674948443937507', cp: 0x1F513 }, // 🔓 access / start
    spark: { id: '5800759688693816045', cp: 0x1F389 }, // 🎉 clean / celebrate
    target: { id: '5784936865966594550', cp: 0x1F51D }, // 🔝 goal / top
    // Keycap step numbers
    num1: { id: '5787546793038321619', alt: '1\uFE0F\u20E3' }, // 1️⃣
    num2: { id: '5785314148778777346', alt: '2\uFE0F\u20E3' }, // 2️⃣
    num3: { id: '5787253824729126735', alt: '3\uFE0F\u20E3' }, // 3️⃣
};
/** Returns an HTML <tg-emoji> tag for the named premium emoji. */
function ce(name) {
    const e = E[name];
    const alt = e.alt ?? String.fromCodePoint(e.cp);
    return `<tg-emoji emoji-id="${e.id}">${alt}</tg-emoji>`;
}
/** Replace <tg-emoji> tags with their plain alt emoji (fallback path). */
function stripCustomEmoji(html) {
    return html.replace(/<tg-emoji[^>]*>(.*?)<\/tg-emoji>/g, '$1');
}
