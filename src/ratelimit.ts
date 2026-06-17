// In-memory per-user rate limiting (anti-spam / anti-flood).
//
// All updates reach us from Telegram over a single source, so limiting by IP is
// useless — we throttle by Telegram user id instead. State is intentionally
// in-process: it is cheap, needs no DB, and resetting on restart is acceptable
// for abuse protection. For a multi-instance deployment move this to Redis.

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

// Periodically drop expired windows so the map can't grow unbounded.
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, win] of buckets) {
    if (win.resetAt <= now) buckets.delete(key);
  }
}, PRUNE_INTERVAL_MS).unref?.();

export interface RateResult {
  allowed: boolean;
  /** ms until the window resets (only meaningful when !allowed). */
  retryAfterMs: number;
}

/** Fixed-window limiter. Returns whether this hit is allowed. */
export function hit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  const win = buckets.get(key);

  if (!win || win.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (win.count >= limit) {
    return { allowed: false, retryAfterMs: win.resetAt - now };
  }

  win.count++;
  return { allowed: true, retryAfterMs: 0 };
}

// ── Tunable limits ────────────────────────────────────────────────────────────

// General message/update throughput per user. Generous enough for real use,
// tight enough to stop a flood from hammering the DB and Telegram API.
export const GENERAL_LIMIT = 20;
export const GENERAL_WINDOW_MS = 10_000;

// "Expensive" actions that hit the Telegram API (getChatMember) or write to the
// DB. Kept much stricter than the general limit.
export const HEAVY_LIMIT = 10;
export const HEAVY_WINDOW_MS = 60_000;

/** True for commands/flows that trigger external API calls or DB writes. */
export function isHeavyCommand(raw: string): boolean {
  const cmd = raw.split(/\s|@/)[0] ?? '';
  return (
    cmd === '/add' ||
    cmd === '/remove' ||
    cmd === '/apply' ||
    cmd === '/save' ||
    cmd === '/schedule' ||
    cmd === '/broadcast' ||
    cmd === '/grant_premium'
  );
}
