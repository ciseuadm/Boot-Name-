"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREMIUM_MAX_TEMPLATES = exports.PREMIUM_MAX_BUTTONS = exports.FREE_MAX_TEMPLATES = exports.FREE_MAX_BUTTONS = exports.FREE_DAILY_LIMIT = exports.pool = void 0;
exports.initDb = initDb;
exports.getOrCreateUser = getOrCreateUser;
exports.getUser = getUser;
exports.isPremium = isPremium;
exports.grantPremium = grantPremium;
exports.getUserByReferralCode = getUserByReferralCode;
exports.recordReferral = recordReferral;
exports.setStatsEnabled = setStatsEnabled;
exports.logUsage = logUsage;
exports.getDailyUsage = getDailyUsage;
exports.countTemplates = countTemplates;
exports.getTemplates = getTemplates;
exports.getTemplate = getTemplate;
exports.saveTemplate = saveTemplate;
exports.deleteTemplate = deleteTemplate;
exports.createScheduledTask = createScheduledTask;
exports.getPendingTasks = getPendingTasks;
exports.markTaskDone = markTaskDone;
exports.markTaskFailed = markTaskFailed;
exports.getUserScheduledTasks = getUserScheduledTasks;
exports.cancelScheduledTask = cancelScheduledTask;
exports.createTrackedLink = createTrackedLink;
exports.getTrackedLink = getTrackedLink;
exports.incrementClick = incrementClick;
exports.getPostStats = getPostStats;
exports.getUserTrackedLinks = getUserTrackedLinks;
exports.recordPayment = recordPayment;
exports.getAdminStats = getAdminStats;
exports.getAllUserIds = getAllUserIds;
const pg_1 = require("pg");
const crypto_1 = __importDefault(require("crypto"));
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});
// ─── Schema init ────────────────────────────────────────────────────────────
async function initDb() {
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
    const client = await exports.pool.connect();
    try {
        for (const sql of stmts) {
            await client.query(sql);
        }
    }
    finally {
        client.release();
    }
}
// ─── Users ──────────────────────────────────────────────────────────────────
function genReferralCode() {
    return crypto_1.default.randomBytes(4).toString('hex').toUpperCase();
}
async function getOrCreateUser(id, firstName, username) {
    const code = genReferralCode();
    const { rows } = await exports.pool.query(`INSERT INTO users (id, first_name, username, referral_code)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       first_name = EXCLUDED.first_name,
       username   = EXCLUDED.username
     RETURNING *`, [id, firstName, username ?? null, code]);
    return rows[0];
}
async function getUser(id) {
    const { rows } = await exports.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ?? null;
}
async function isPremium(userId) {
    const { rows } = await exports.pool.query('SELECT plan, premium_until FROM users WHERE id = $1', [userId]);
    if (!rows[0])
        return false;
    const { plan, premium_until } = rows[0];
    if (plan !== 'premium')
        return false;
    if (premium_until && new Date() > new Date(premium_until)) {
        await exports.pool.query("UPDATE users SET plan = 'free', premium_until = NULL WHERE id = $1", [userId]);
        return false;
    }
    return true;
}
async function grantPremium(userId, months) {
    await exports.pool.query(`UPDATE users SET
       plan = 'premium',
       premium_until = GREATEST(COALESCE(premium_until, NOW()), NOW()) + ($2 * INTERVAL '1 month')
     WHERE id = $1`, [userId, months]);
}
async function getUserByReferralCode(code) {
    const { rows } = await exports.pool.query('SELECT * FROM users WHERE referral_code = $1', [code.toUpperCase()]);
    return rows[0] ?? null;
}
async function recordReferral(newUserId, referrerId) {
    await exports.pool.query('UPDATE users SET referred_by = $1 WHERE id = $2 AND referred_by IS NULL', [referrerId, newUserId]);
    const { rows } = await exports.pool.query('UPDATE users SET referral_count = referral_count + 1 WHERE id = $1 RETURNING referral_count', [referrerId]);
    const count = rows[0]?.referral_count ?? 0;
    if (count % 3 === 0) {
        await grantPremium(referrerId, 1);
    }
}
async function setStatsEnabled(userId, enabled) {
    await exports.pool.query('UPDATE users SET stats_enabled = $2 WHERE id = $1', [userId, enabled]);
}
// ─── Usage / limits ─────────────────────────────────────────────────────────
exports.FREE_DAILY_LIMIT = 5;
exports.FREE_MAX_BUTTONS = 6;
exports.FREE_MAX_TEMPLATES = 3;
exports.PREMIUM_MAX_BUTTONS = 20;
exports.PREMIUM_MAX_TEMPLATES = 50;
async function logUsage(userId, action) {
    await exports.pool.query('INSERT INTO usage_log (user_id, action) VALUES ($1, $2)', [userId, action]);
}
async function getDailyUsage(userId) {
    const { rows } = await exports.pool.query(`SELECT COUNT(*) FROM usage_log
     WHERE user_id = $1 AND action = 'add_buttons'
     AND created_at > NOW() - INTERVAL '24 hours'`, [userId]);
    return parseInt(rows[0]?.count ?? '0', 10);
}
// ─── Templates ──────────────────────────────────────────────────────────────
async function countTemplates(userId) {
    const { rows } = await exports.pool.query('SELECT COUNT(*) FROM templates WHERE user_id = $1', [userId]);
    return parseInt(rows[0]?.count ?? '0', 10);
}
async function getTemplates(userId) {
    const { rows } = await exports.pool.query('SELECT * FROM templates WHERE user_id = $1 ORDER BY name ASC', [userId]);
    return rows;
}
async function getTemplate(userId, name) {
    const { rows } = await exports.pool.query('SELECT * FROM templates WHERE user_id = $1 AND LOWER(name) = LOWER($2)', [userId, name]);
    return rows[0] ?? null;
}
async function saveTemplate(userId, name, buttonsText) {
    await exports.pool.query(`INSERT INTO templates (user_id, name, buttons_text) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, name) DO UPDATE SET buttons_text = EXCLUDED.buttons_text`, [userId, name, buttonsText]);
}
async function deleteTemplate(userId, name) {
    const result = await exports.pool.query('DELETE FROM templates WHERE user_id = $1 AND LOWER(name) = LOWER($2)', [userId, name]);
    return (result.rowCount ?? 0) > 0;
}
// ─── Scheduled tasks ────────────────────────────────────────────────────────
async function createScheduledTask(userId, postChatId, postMessageId, buttonsText, runAt) {
    const { rows } = await exports.pool.query(`INSERT INTO scheduled_tasks (user_id, post_chat_id, post_message_id, buttons_text, run_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`, [userId, postChatId, postMessageId, buttonsText, runAt]);
    return rows[0];
}
async function getPendingTasks() {
    const { rows } = await exports.pool.query('SELECT * FROM scheduled_tasks WHERE done = FALSE AND failed = FALSE AND run_at <= NOW()');
    return rows;
}
async function markTaskDone(id) {
    await exports.pool.query('UPDATE scheduled_tasks SET done = TRUE WHERE id = $1', [id]);
}
async function markTaskFailed(id, error) {
    await exports.pool.query('UPDATE scheduled_tasks SET failed = TRUE, error_msg = $2 WHERE id = $1', [id, error]);
}
async function getUserScheduledTasks(userId) {
    const { rows } = await exports.pool.query(`SELECT * FROM scheduled_tasks WHERE user_id = $1 AND done = FALSE AND failed = FALSE
     ORDER BY run_at ASC LIMIT 10`, [userId]);
    return rows;
}
async function cancelScheduledTask(id, userId) {
    const result = await exports.pool.query('DELETE FROM scheduled_tasks WHERE id = $1 AND user_id = $2 AND done = FALSE AND failed = FALSE', [id, userId]);
    return (result.rowCount ?? 0) > 0;
}
// ─── Tracked links ──────────────────────────────────────────────────────────
async function createTrackedLink(userId, originalUrl, label, postChatId, postMessageId) {
    const code = crypto_1.default.randomBytes(5).toString('base64url');
    await exports.pool.query(`INSERT INTO tracked_links
       (short_code, user_id, original_url, button_label, post_chat_id, post_message_id)
     VALUES ($1, $2, $3, $4, $5, $6)`, [code, userId, originalUrl, label, postChatId, postMessageId]);
    return code;
}
async function getTrackedLink(shortCode) {
    const { rows } = await exports.pool.query('SELECT * FROM tracked_links WHERE short_code = $1', [shortCode]);
    return rows[0] ?? null;
}
async function incrementClick(shortCode) {
    await exports.pool.query('UPDATE tracked_links SET clicks = clicks + 1 WHERE short_code = $1', [shortCode]);
}
async function getPostStats(userId, postChatId, postMessageId) {
    const { rows } = await exports.pool.query(`SELECT * FROM tracked_links
     WHERE user_id = $1 AND post_chat_id = $2 AND post_message_id = $3
     ORDER BY clicks DESC`, [userId, postChatId, postMessageId]);
    return rows;
}
async function getUserTrackedLinks(userId) {
    const { rows } = await exports.pool.query(`SELECT * FROM tracked_links WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`, [userId]);
    return rows;
}
// ─── Payments ───────────────────────────────────────────────────────────────
async function recordPayment(userId, chargeId, stars, planKey, months) {
    await exports.pool.query(`INSERT INTO payments (user_id, telegram_charge_id, stars_amount, plan_key, months)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (telegram_charge_id) DO NOTHING`, [userId, chargeId, stars, planKey, months]);
}
// ─── Admin stats ────────────────────────────────────────────────────────────
async function getAdminStats() {
    const [users, premium, dau, templates, tasks, payments, clicks] = await Promise.all([
        exports.pool.query('SELECT COUNT(*) FROM users'),
        exports.pool.query("SELECT COUNT(*) FROM users WHERE plan = 'premium' AND (premium_until IS NULL OR premium_until > NOW())"),
        exports.pool.query(`SELECT COUNT(DISTINCT user_id) FROM usage_log WHERE created_at > NOW() - INTERVAL '24 hours'`),
        exports.pool.query('SELECT COUNT(*) FROM templates'),
        exports.pool.query('SELECT COUNT(*) FROM scheduled_tasks WHERE done = FALSE AND failed = FALSE'),
        exports.pool.query('SELECT COUNT(*) FROM payments'),
        exports.pool.query('SELECT COALESCE(SUM(clicks), 0) AS sum FROM tracked_links'),
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
async function getAllUserIds() {
    const { rows } = await exports.pool.query('SELECT id FROM users ORDER BY created_at');
    return rows.map(r => r.id);
}
