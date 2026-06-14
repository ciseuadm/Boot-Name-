import { Pool } from 'pg';
import crypto from 'crypto';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

// ─── Types ─────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string | null;
  first_name: string;
  plan: 'free' | 'premium';
  premium_until: Date | null;
  referral_code: string;
  referred_by: number | null;
  referral_count: number;
  stats_enabled: boolean;
  created_at: Date;
}

export interface Template {
  id: number;
  user_id: number;
  name: string;
  buttons_text: string;
  created_at: Date;
}

export interface ScheduledTask {
  id: number;
  user_id: number;
  post_chat_id: string;
  post_message_id: number;
  buttons_text: string;
  run_at: Date;
  done: boolean;
  failed: boolean;
  error_msg: string | null;
}

export interface TrackedLink {
  id: number;
  short_code: string;
  user_id: number;
  original_url: string;
  button_label: string;
  post_chat_id: string;
  post_message_id: number;
  clicks: number;
  created_at: Date;
}

// ─── Schema init ────────────────────────────────────────────────────────────

export async function initDb(): Promise<void> {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      username TEXT,
      first_name TEXT NOT NULL DEFAULT '',
      plan TEXT NOT NULL DEFAULT 'free',
      premium_until TIMESTAMPTZ,
      referral_code TEXT UNIQUE NOT NULL,
      referred_by BIGINT,
      referral_count INT NOT NULL DEFAULT 0,
      stats_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS usage_log (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      action TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_usage_user_action_day ON usage_log(user_id, action, created_at)`,
    `CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      name TEXT NOT NULL,
      buttons_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, name)
    )`,
    `CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      post_chat_id TEXT NOT NULL,
      post_message_id INT NOT NULL,
      buttons_text TEXT NOT NULL,
      run_at TIMESTAMPTZ NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      failed BOOLEAN NOT NULL DEFAULT FALSE,
      error_msg TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS tracked_links (
      id SERIAL PRIMARY KEY,
      short_code TEXT NOT NULL UNIQUE,
      user_id BIGINT NOT NULL,
      original_url TEXT NOT NULL,
      button_label TEXT NOT NULL,
      post_chat_id TEXT NOT NULL,
      post_message_id INT NOT NULL,
      clicks INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      telegram_charge_id TEXT UNIQUE,
      stars_amount INT NOT NULL,
      plan_key TEXT NOT NULL,
      months INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  ];

  const client = await pool.connect();
  try {
    for (const sql of stmts) {
      await client.query(sql);
    }
  } finally {
    client.release();
  }
}

// ─── Users ──────────────────────────────────────────────────────────────────

function genReferralCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function getOrCreateUser(
  id: number,
  firstName: string,
  username?: string,
): Promise<User> {
  const code = genReferralCode();
  const { rows } = await pool.query<User>(
    `INSERT INTO users (id, first_name, username, referral_code)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       first_name = EXCLUDED.first_name,
       username   = EXCLUDED.username
     RETURNING *`,
    [id, firstName, username ?? null, code],
  );
  return rows[0]!;
}

export async function getUser(id: number): Promise<User | null> {
  const { rows } = await pool.query<User>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function isPremium(userId: number): Promise<boolean> {
  const { rows } = await pool.query<{ plan: string; premium_until: Date | null }>(
    'SELECT plan, premium_until FROM users WHERE id = $1',
    [userId],
  );
  if (!rows[0]) return false;
  const { plan, premium_until } = rows[0];
  if (plan !== 'premium') return false;
  if (premium_until && new Date() > new Date(premium_until)) {
    await pool.query("UPDATE users SET plan = 'free', premium_until = NULL WHERE id = $1", [userId]);
    return false;
  }
  return true;
}

export async function grantPremium(userId: number, months: number): Promise<void> {
  await pool.query(
    `UPDATE users SET
       plan = 'premium',
       premium_until = GREATEST(COALESCE(premium_until, NOW()), NOW()) + ($2 * INTERVAL '1 month')
     WHERE id = $1`,
    [userId, months],
  );
}

export async function getUserByReferralCode(code: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    'SELECT * FROM users WHERE referral_code = $1',
    [code.toUpperCase()],
  );
  return rows[0] ?? null;
}

export async function recordReferral(newUserId: number, referrerId: number): Promise<void> {
  await pool.query(
    'UPDATE users SET referred_by = $1 WHERE id = $2 AND referred_by IS NULL',
    [referrerId, newUserId],
  );
  const { rows } = await pool.query<{ referral_count: number }>(
    'UPDATE users SET referral_count = referral_count + 1 WHERE id = $1 RETURNING referral_count',
    [referrerId],
  );
  const count = rows[0]?.referral_count ?? 0;
  if (count % 3 === 0) {
    await grantPremium(referrerId, 1);
  }
}

export async function setStatsEnabled(userId: number, enabled: boolean): Promise<void> {
  await pool.query('UPDATE users SET stats_enabled = $2 WHERE id = $1', [userId, enabled]);
}

// ─── Usage / limits ─────────────────────────────────────────────────────────

export const FREE_DAILY_LIMIT = 5;
export const FREE_MAX_BUTTONS = 6;
export const FREE_MAX_TEMPLATES = 3;
export const PREMIUM_MAX_BUTTONS = 20;
export const PREMIUM_MAX_TEMPLATES = 50;

export async function logUsage(userId: number, action: string): Promise<void> {
  await pool.query('INSERT INTO usage_log (user_id, action) VALUES ($1, $2)', [userId, action]);
}

export async function getDailyUsage(userId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM usage_log
     WHERE user_id = $1 AND action = 'add_buttons'
     AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

// ─── Templates ──────────────────────────────────────────────────────────────

export async function countTemplates(userId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) FROM templates WHERE user_id = $1',
    [userId],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

export async function getTemplates(userId: number): Promise<Template[]> {
  const { rows } = await pool.query<Template>(
    'SELECT * FROM templates WHERE user_id = $1 ORDER BY name ASC',
    [userId],
  );
  return rows;
}

export async function getTemplate(userId: number, name: string): Promise<Template | null> {
  const { rows } = await pool.query<Template>(
    'SELECT * FROM templates WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
    [userId, name],
  );
  return rows[0] ?? null;
}

export async function saveTemplate(
  userId: number,
  name: string,
  buttonsText: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO templates (user_id, name, buttons_text) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, name) DO UPDATE SET buttons_text = EXCLUDED.buttons_text`,
    [userId, name, buttonsText],
  );
}

export async function deleteTemplate(userId: number, name: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM templates WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
    [userId, name],
  );
  return (result.rowCount ?? 0) > 0;
}

// ─── Scheduled tasks ────────────────────────────────────────────────────────

export async function createScheduledTask(
  userId: number,
  postChatId: string,
  postMessageId: number,
  buttonsText: string,
  runAt: Date,
): Promise<ScheduledTask> {
  const { rows } = await pool.query<ScheduledTask>(
    `INSERT INTO scheduled_tasks (user_id, post_chat_id, post_message_id, buttons_text, run_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, postChatId, postMessageId, buttonsText, runAt],
  );
  return rows[0]!;
}

export async function getPendingTasks(): Promise<ScheduledTask[]> {
  const { rows } = await pool.query<ScheduledTask>(
    'SELECT * FROM scheduled_tasks WHERE done = FALSE AND failed = FALSE AND run_at <= NOW()',
  );
  return rows;
}

export async function markTaskDone(id: number): Promise<void> {
  await pool.query('UPDATE scheduled_tasks SET done = TRUE WHERE id = $1', [id]);
}

export async function markTaskFailed(id: number, error: string): Promise<void> {
  await pool.query(
    'UPDATE scheduled_tasks SET failed = TRUE, error_msg = $2 WHERE id = $1',
    [id, error],
  );
}

export async function getUserScheduledTasks(userId: number): Promise<ScheduledTask[]> {
  const { rows } = await pool.query<ScheduledTask>(
    `SELECT * FROM scheduled_tasks WHERE user_id = $1 AND done = FALSE AND failed = FALSE
     ORDER BY run_at ASC LIMIT 10`,
    [userId],
  );
  return rows;
}

export async function cancelScheduledTask(id: number, userId: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM scheduled_tasks WHERE id = $1 AND user_id = $2 AND done = FALSE AND failed = FALSE',
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

// ─── Tracked links ──────────────────────────────────────────────────────────

export async function createTrackedLink(
  userId: number,
  originalUrl: string,
  label: string,
  postChatId: string,
  postMessageId: number,
): Promise<string> {
  const code = crypto.randomBytes(5).toString('base64url');
  await pool.query(
    `INSERT INTO tracked_links
       (short_code, user_id, original_url, button_label, post_chat_id, post_message_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [code, userId, originalUrl, label, postChatId, postMessageId],
  );
  return code;
}

export async function getTrackedLink(shortCode: string): Promise<TrackedLink | null> {
  const { rows } = await pool.query<TrackedLink>(
    'SELECT * FROM tracked_links WHERE short_code = $1',
    [shortCode],
  );
  return rows[0] ?? null;
}

export async function incrementClick(shortCode: string): Promise<void> {
  await pool.query('UPDATE tracked_links SET clicks = clicks + 1 WHERE short_code = $1', [shortCode]);
}

export async function getPostStats(
  userId: number,
  postChatId: string,
  postMessageId: number,
): Promise<TrackedLink[]> {
  const { rows } = await pool.query<TrackedLink>(
    `SELECT * FROM tracked_links
     WHERE user_id = $1 AND post_chat_id = $2 AND post_message_id = $3
     ORDER BY clicks DESC`,
    [userId, postChatId, postMessageId],
  );
  return rows;
}

export async function getUserTrackedLinks(userId: number): Promise<TrackedLink[]> {
  const { rows } = await pool.query<TrackedLink>(
    `SELECT * FROM tracked_links WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [userId],
  );
  return rows;
}

// ─── Payments ───────────────────────────────────────────────────────────────

export async function recordPayment(
  userId: number,
  chargeId: string,
  stars: number,
  planKey: string,
  months: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO payments (user_id, telegram_charge_id, stars_amount, plan_key, months)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (telegram_charge_id) DO NOTHING`,
    [userId, chargeId, stars, planKey, months],
  );
}

// ─── Admin stats ────────────────────────────────────────────────────────────

export async function getAdminStats(): Promise<{
  totalUsers: number;
  premiumUsers: number;
  dau: number;
  totalTemplates: number;
  pendingTasks: number;
  totalPayments: number;
  totalClicks: number;
}> {
  const [users, premium, dau, templates, tasks, payments, clicks] = await Promise.all([
    pool.query<{ count: string }>('SELECT COUNT(*) FROM users'),
    pool.query<{ count: string }>(
      "SELECT COUNT(*) FROM users WHERE plan = 'premium' AND (premium_until IS NULL OR premium_until > NOW())",
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT user_id) FROM usage_log WHERE created_at > NOW() - INTERVAL '24 hours'`,
    ),
    pool.query<{ count: string }>('SELECT COUNT(*) FROM templates'),
    pool.query<{ count: string }>(
      'SELECT COUNT(*) FROM scheduled_tasks WHERE done = FALSE AND failed = FALSE',
    ),
    pool.query<{ count: string }>('SELECT COUNT(*) FROM payments'),
    pool.query<{ sum: string }>('SELECT COALESCE(SUM(clicks), 0) AS sum FROM tracked_links'),
  ]);

  return {
    totalUsers: parseInt(users.rows[0]?.count ?? '0', 10),
    premiumUsers: parseInt(premium.rows[0]?.count ?? '0', 10),
    dau: parseInt(dau.rows[0]?.count ?? '0', 10),
    totalTemplates: parseInt(templates.rows[0]?.count ?? '0', 10),
    pendingTasks: parseInt(tasks.rows[0]?.count ?? '0', 10),
    totalPayments: parseInt(payments.rows[0]?.count ?? '0', 10),
    totalClicks: parseInt(clicks.rows[0]?.sum ?? '0', 10),
  };
}

export async function getAllUserIds(): Promise<number[]> {
  const { rows } = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY created_at');
  return rows.map(r => r.id);
}
