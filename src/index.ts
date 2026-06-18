import express, { Response } from 'express';
import path from 'path';
import { BOT_TOKEN, WEBHOOK_SECRET, initBotInfo, setWebhook, setMyCommands, TgUpdate } from './tg';
import { initDb } from './db';
import { handleUpdate } from './bot';
import { startScheduler } from './scheduler';
import { recoverCursorTasks } from './handlers/cursor';
import { getCursorRef } from './cursor-refs';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const app = express();
app.disable('x-powered-by');

// Telegram updates are tiny JSON payloads; cap the body to reject oversized
// or malformed POSTs cheaply instead of buffering arbitrary amounts of data.
app.use(express.json({ limit: '256kb' }));

// Minimal hardening headers for the few browser-reachable endpoints.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// ── Bot images (used in /start welcome) ──────────────────────────────────────

function sendBotImage(res: Response, ...segments: string[]): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(process.cwd(), ...segments));
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
  const ref = getCursorRef(req.params.token);
  if (!ref) {
    res.sendStatus(404);
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.type(ref.mimeType).send(ref.buffer);
});

// ── Telegram webhook ─────────────────────────────────────────────────────────

app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
  // Reject anyone who isn't Telegram: the secret is set via setWebhook and
  // echoed back in this header on every legitimate update.
  if (req.header('X-Telegram-Bot-Api-Secret-Token') !== WEBHOOK_SECRET) {
    res.sendStatus(401);
    return;
  }
  res.sendStatus(200);
  handleUpdate(req.body as TgUpdate).catch(e => console.error('Update error:', e));
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await initDb();
  console.log('Database ready');

  await initBotInfo();
  console.log(`Bot: @${require('./tg').BOT_USERNAME}`);

  await setWebhook();
  await setMyCommands();

  startScheduler();

  // Re-attach to any Cursor task that was mid-run when we last shut down.
  recoverCursorTasks().catch(e => console.error('Cursor recovery error:', e));

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
