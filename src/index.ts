import express from 'express';
import path from 'path';
import { BOT_TOKEN, WEBHOOK_URL, initBotInfo, setWebhook, setMyCommands, TgUpdate } from './tg';
import { initDb, getTrackedLink, incrementClick } from './db';
import { handleUpdate } from './bot';
import { startScheduler } from './scheduler';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const app = express();
app.use(express.json());

// ── Bot images (used in /start welcome) ──────────────────────────────────────

app.get('/avatar.png', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'assets', 'avatars', 'avatar-2-dark-neon.png'));
});

app.get('/banner.png', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'assets', 'banner-dark-neon.png'));
});

// ── Telegram webhook ─────────────────────────────────────────────────────────

app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
  res.sendStatus(200);
  handleUpdate(req.body as TgUpdate).catch(e => console.error('Update error:', e));
});

// ── Click tracking redirect ───────────────────────────────────────────────────

app.get('/r/:code', async (req, res) => {
  try {
    const link = await getTrackedLink(req.params.code!);
    if (!link) {
      res.status(404).send('Not found');
      return;
    }
    incrementClick(link.short_code).catch(() => {});
    res.redirect(302, link.original_url);
  } catch {
    res.status(500).send('Error');
  }
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

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
