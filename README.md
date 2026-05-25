# Add Button Bot 🐤

Telegram bot that adds inline keyboard buttons to any channel post — no watermarks, no attribution.

## Features

- Add up to **20 buttons** per post
- **Flexible grid layout** — multiple buttons per row (perfect for zodiac signs, menus, etc.)
- Remove all buttons from a post
- No "created with ..." branding

## Button Format

Each line = one row. Pairs of `Text | URL` within a line = buttons side by side.

```
Play 🎮 | https://t.me/yourbot
Channel | https://t.me/ch | Support | https://t.me/support
♈ Aries | url | ♉ Taurus | url | ♊ Gemini | url
♋ Cancer | url | ♌ Leo | url | ♍ Virgo | url
```

## Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and get the token
2. Add the bot as admin to your channel with **Edit Messages** permission
3. Deploy (see below)

## Deploy on Railway

1. Push this repo to GitHub
2. Create a new Railway project → Deploy from GitHub
3. Set environment variables:
   - `BOT_TOKEN` — your bot token
   - `WEBHOOK_URL` — your Railway public URL (e.g. `https://your-app.up.railway.app`)
4. Deploy — the bot sets its webhook automatically on startup

## Commands

- `/add` — add buttons to a post
- `/remove` — remove all buttons from a post
- `/help` — show help
