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
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const app = (0, express_1.default)();
app.use(express_1.default.json());
// ── Bot images (used in /start welcome) ──────────────────────────────────────
app.get('/avatar.png', (_req, res) => {
    res.sendFile(path_1.default.join(process.cwd(), 'assets', 'avatars', 'avatar-2-dark-neon.png'));
});
app.get('/banner.png', (_req, res) => {
    res.sendFile(path_1.default.join(process.cwd(), 'assets', 'banner-dark-neon.png'));
});
// ── Telegram webhook ─────────────────────────────────────────────────────────
app.post(`/webhook/${tg_1.BOT_TOKEN}`, (req, res) => {
    res.sendStatus(200);
    (0, bot_1.handleUpdate)(req.body).catch(e => console.error('Update error:', e));
});
// ── Click tracking redirect ───────────────────────────────────────────────────
app.get('/r/:code', async (req, res) => {
    try {
        const link = await (0, db_1.getTrackedLink)(req.params.code);
        if (!link) {
            res.status(404).send('Not found');
            return;
        }
        (0, db_1.incrementClick)(link.short_code).catch(() => { });
        res.redirect(302, link.original_url);
    }
    catch {
        res.status(500).send('Error');
    }
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
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}
main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
