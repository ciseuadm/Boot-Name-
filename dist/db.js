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
exports.grantPremiumDays = grantPremiumDays;
exports.recordReferral = recordReferral;
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
exports.recordPayment = recordPayment;
exports.getAdminStats = getAdminStats;
exports.getAllUserIds = getAllUserIds;
exports.createCursorTask = createCursorTask;
exports.setCursorTaskRun = setCursorTaskRun;
exports.finishCursorTask = finishCursorTask;
exports.getRunningCursorTasks = getRunningCursorTasks;
exports.getLatestCursorAgent = getLatestCursorAgent;
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
        `CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      telegram_charge_id TEXT UNIQUE,
      stars_amount INT NOT NULL,
      plan_key TEXT NOT NULL,
      months INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
        `CREATE TABLE IF NOT EXISTS cursor_tasks (
      id SERIAL PRIMARY KEY,
      admin_id BIGINT NOT NULL,
      chat_id BIGINT NOT NULL,
      agent_id TEXT,
      run_id TEXT,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      result TEXT,
      pr_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
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
async function grantPremiumDays(userId, days) {
    await exports.pool.query(`UPDATE users SET
       plan = 'premium',
       premium_until = GREATEST(COALESCE(premium_until, NOW()), NOW()) + ($2 * INTERVAL '1 day')
     WHERE id = $1`, [userId, days]);
}
async function recordReferral(newUserId, referrerId) {
    const updated = await exports.pool.query('UPDATE users SET referred_by = $1 WHERE id = $2 AND referred_by IS NULL', [referrerId, newUserId]);
    // Guard against double-counting if this referral was already recorded
    if ((updated.rowCount ?? 0) === 0)
        return;
    const { rows } = await exports.pool.query('UPDATE users SET referral_count = referral_count + 1 WHERE id = $1 RETURNING referral_count', [referrerId]);
    const count = rows[0]?.referral_count ?? 0;
    // +1 day for every referral
    await grantPremiumDays(referrerId, 1);
    // Bonus: +5 days for every 3rd referral
    if (count % 3 === 0) {
        await grantPremiumDays(referrerId, 5);
    }
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
// ─── Payments ───────────────────────────────────────────────────────────────
async function recordPayment(userId, chargeId, stars, planKey, months) {
    await exports.pool.query(`INSERT INTO payments (user_id, telegram_charge_id, stars_amount, plan_key, months)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (telegram_charge_id) DO NOTHING`, [userId, chargeId, stars, planKey, months]);
}
// ─── Admin stats ────────────────────────────────────────────────────────────
async function getAdminStats() {
    const [users, premium, dau, templates, tasks, payments] = await Promise.all([
        exports.pool.query('SELECT COUNT(*) FROM users'),
        exports.pool.query("SELECT COUNT(*) FROM users WHERE plan = 'premium' AND (premium_until IS NULL OR premium_until > NOW())"),
        exports.pool.query(`SELECT COUNT(DISTINCT user_id) FROM usage_log WHERE created_at > NOW() - INTERVAL '24 hours'`),
        exports.pool.query('SELECT COUNT(*) FROM templates'),
        exports.pool.query('SELECT COUNT(*) FROM scheduled_tasks WHERE done = FALSE AND failed = FALSE'),
        exports.pool.query('SELECT COUNT(*) FROM payments'),
    ]);
    return {
        totalUsers: parseInt(users.rows[0]?.count ?? '0', 10),
        premiumUsers: parseInt(premium.rows[0]?.count ?? '0', 10),
        dau: parseInt(dau.rows[0]?.count ?? '0', 10),
        totalTemplates: parseInt(templates.rows[0]?.count ?? '0', 10),
        pendingTasks: parseInt(tasks.rows[0]?.count ?? '0', 10),
        totalPayments: parseInt(payments.rows[0]?.count ?? '0', 10),
    };
}
async function getAllUserIds() {
    const { rows } = await exports.pool.query('SELECT id FROM users ORDER BY created_at');
    return rows.map(r => r.id);
}
async function createCursorTask(adminId, chatId, prompt) {
    const { rows } = await exports.pool.query(`INSERT INTO cursor_tasks (admin_id, chat_id, prompt) VALUES ($1, $2, $3) RETURNING id`, [adminId, chatId, prompt]);
    return rows[0].id;
}
async function setCursorTaskRun(id, agentId, runId) {
    await exports.pool.query('UPDATE cursor_tasks SET agent_id = $2, run_id = $3 WHERE id = $1', [
        id,
        agentId,
        runId,
    ]);
}
async function finishCursorTask(id, status, result, prUrl) {
    await exports.pool.query(`UPDATE cursor_tasks SET status = $2, result = $3, pr_url = $4, finished_at = NOW() WHERE id = $1`, [id, status, result, prUrl]);
}
/** Tasks that were dispatched but never reached a terminal state (crash recovery). */
async function getRunningCursorTasks() {
    const { rows } = await exports.pool.query(`SELECT * FROM cursor_tasks WHERE status = 'running' AND run_id IS NOT NULL ORDER BY created_at`);
    return rows;
}
/** Most recent agent id for an admin, to continue the conversation after a restart. */
async function getLatestCursorAgent(adminId) {
    const { rows } = await exports.pool.query(`SELECT agent_id FROM cursor_tasks
     WHERE admin_id = $1 AND agent_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`, [adminId]);
    return rows[0]?.agent_id ?? null;
}
