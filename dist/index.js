"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const tg_1 = require("./tg");
const db_1 = require("./db");
const bot_1 = require("./bot");
const scheduler_1 = require("./scheduler");
const cursor_1 = require("./handlers/cursor");
const cursor_refs_1 = require("./cursor-refs");
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const app = (0, express_1.default)();
app.disable('x-powered-by');
// Telegram updates are tiny JSON payloads; cap the body to reject oversized
// or malformed POSTs cheaply instead of buffering arbitrary amounts of data.
app.use(express_1.default.json({ limit: '256kb' }));
// Minimal hardening headers for the few browser-reachable endpoints.
app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});
// ── Bot images (used in /start welcome) ──────────────────────────────────────
function sendBotImage(res, ...segments) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path_1.default.join(process.cwd(), ...segments));
}
app.get('/avatar.png', (_req, res) => {
    sendBotImage(res, 'assets', 'avatars', 'avatar-2-dark-neon.png');
});
app.get('/banner.png', (_req, res) => {
    sendBotImage(res, 'assets', 'banner-dark-neon.png');
});
// Vertical premium card for /premium (banner + copy in one image).
app.get('/premium-card.png', (_req, res) => {
    sendBotImage(res, 'assets', 'premium-card-dark-neon.png');
});
// Horizontal premium banner. Legacy paths keep Telegram cache bust working.
app.get('/premium-banner.png', (_req, res) => {
    sendBotImage(res, 'assets', 'premium-banner-dark-neon.png');
});
app.get('/premium.png', (_req, res) => {
    sendBotImage(res, 'assets', 'premium-banner-dark-neon.png');
});
// Short-lived image refs for Cursor Cloud Agents (Telegram → Cursor bridge).
app.get('/cursor-ref/:token', (req, res) => {
    const ref = (0, cursor_refs_1.getCursorRef)(req.params.token);
    if (!ref) {
        res.sendStatus(404);
        return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type(ref.mimeType).send(ref.buffer);
});
// ── Telegram webhook ─────────────────────────────────────────────────────────
app.post(`/webhook/${tg_1.BOT_TOKEN}`, (req, res) => {
    // Reject anyone who isn't Telegram: the secret is set via setWebhook and
    // echoed back in this header on every legitimate update.
    if (req.header('X-Telegram-Bot-Api-Secret-Token') !== tg_1.WEBHOOK_SECRET) {
        res.sendStatus(401);
        return;
    }
    res.sendStatus(200);
    (0, bot_1.handleUpdate)(req.body).catch(e => console.error('Update error:', e));
});
// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));
// ── Boot ──────────────────────────────────────────────────────────────────────
async function main() {
    await (0, db_1.initDb)();
    console.log('Database ready');
    await (0, tg_1.initBotInfo)();
    console.log(`Bot: @${require('./tg').BOT_USERNAME}`);
    await (0, tg_1.setWebhook)();
    await (0, tg_1.setMyCommands)();
    (0, scheduler_1.startScheduler)();
    // Re-attach to any Cursor task that was mid-run when we last shut down.
    (0, cursor_1.recoverCursorTasks)().catch(e => console.error('Cursor recovery error:', e));
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}
main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
