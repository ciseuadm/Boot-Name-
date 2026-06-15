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
const E = {
    check: { id: '5379666011068835203', cp: 0x2705 }, // ✅ success / confirm
    bolt: { id: '5377834924776627189', cp: 0x26A1 }, // ⚡ speed
    ninja: { id: '5321362835047985289', cp: 0x1F977 }, // 🥷 stealth (no "edited")
    noentry: { id: '5343864838726634378', cp: 0x1F6AB }, // 🚫 no ads/watermark
    chart: { id: '5282734530547951466', cp: 0x1F4CA }, // 📊 analytics
    chartup: { id: '5316817673022101530', cp: 0x1F4C8 }, // 📈 stats growth
    alarm: { id: '4967525849902350972', cp: 0x23F0 }, // ⏰ scheduling
    rocket: { id: '5866355487255039002', cp: 0x1F680 }, // 🚀 call to action
    plus: { id: '5330462483473771381', cp: 0x2795 }, // ➕ add
    trash: { id: '5979070714890686650', cp: 0x1F5D1 }, // 🗑 remove/delete
    dividers: { id: '5818955300463447293', cp: 0x1F5C2 }, // 🗂 templates
    gem: { id: '5377460163110249077', cp: 0x1F48E }, // 💎 premium
    star: { id: '5377366996679670959', cp: 0x2B50 }, // ⭐ plan / highlight
    crown: { id: '5321120470043468200', cp: 0x1F451 }, // 👑 premium active
    handshake: { id: '5978856151209480380', cp: 0x1F91D }, // 🤝 referral
    gift: { id: '5377549086113145493', cp: 0x1F381 }, // 🎁 bonus
    people: { id: '5203934795633020471', cp: 0x1F465 }, // 👥 referrals count
    question: { id: '5314335697321075587', cp: 0x2753 }, // ❓ help
    book: { id: '5318989650868576167', cp: 0x1F4D6 }, // 📖 reference
    bulb: { id: '5228740817337727023', cp: 0x1F4A1 }, // 💡 hint
    link: { id: '5377792383125561840', cp: 0x1F517 }, // 🔗 send link
    fire: { id: '5379824774534930587', cp: 0x1F525 }, // 🔥 hot deal
    warning: { id: '5348177037431414677', cp: 0x26A0 }, // ⚠ limit / caution
    cross: { id: '5377399483812290165', cp: 0x274C }, // ❌ error / cancel
    radio: { id: '5888489858913014264', cp: 0x1F518 }, // 🔘 button / post found
    pushpin: { id: '5379593761128979286', cp: 0x1F4CC }, // 📌 apply template
    pencil: { id: '5956143844457189176', cp: 0x270F }, // ✏ naming / input
    puzzle: { id: '5316896567276347777', cp: 0x1F9E9 }, // 🧩 assemble buttons
    eye: { id: '5886667040432853038', cp: 0x1F441 }, // 👁 tracking on
    bell: { id: '5348496376839805930', cp: 0x1F514 }, // 🔔 timer / notify
    megaphone: { id: '5377855592159257618', cp: 0x1F4E2 }, // 📢 broadcast / share
    money: { id: '5454276769890715064', cp: 0x1F4B0 }, // 💰 payment
    lock: { id: '5454341361903880753', cp: 0x1F512 }, // 🔒 admin
    key: { id: '5978854270013804830', cp: 0x1F511 }, // 🔑 access / start
    spark: { id: '5380050088519278681', cp: 0x2728 }, // ✨ clean / shiny
    target: { id: '5274266216544871353', cp: 0x1F3AF }, // 🎯 goal / templates
    // Keycap step numbers (neonbykaty) — multi-codepoint alts kept as literals
    num1: { id: '5314435971922534805', alt: '1\uFE0F\u20E3' }, // 1️⃣
    num2: { id: '5314266995024208393', alt: '2\uFE0F\u20E3' }, // 2️⃣
    num3: { id: '5314774088927946548', alt: '3\uFE0F\u20E3' }, // 3️⃣
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
