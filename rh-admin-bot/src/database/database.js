const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { ACTIVE_STATUSES, APPLICATION_STATUSES } = require("../config/constants");
const { parseIdList } = require("../utils/format");

const databasePath = path.resolve(
  process.cwd(),
  process.env.DATABASE_PATH || "./data/rh_applications.sqlite",
);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_number INTEGER NOT NULL UNIQUE,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    expires_at INTEGER,
    submitted_at INTEGER,
    under_review_started_at INTEGER,
    under_review_ends_at INTEGER,
    ready_notified_at INTEGER,
    decision_at INTEGER,
    decision_by TEXT,
    denial_reason TEXT,
    warning_sent_at INTEGER,
    cooldown_until INTEGER,
    pending_message_id TEXT,
    pending_thread_id TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS applications_user_status_idx
    ON applications (guild_id, user_id, status);
  CREATE INDEX IF NOT EXISTS applications_expiry_idx
    ON applications (status, expires_at);
  CREATE INDEX IF NOT EXISTS applications_review_idx
    ON applications (status, under_review_ends_at);

  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    question_number INTEGER NOT NULL,
    question_key TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (application_id, question_number)
  );

  CREATE TABLE IF NOT EXISTS configuration (
    guild_id TEXT PRIMARY KEY,
    application_category_id TEXT,
    apply_channel_id TEXT,
    pending_channel_id TEXT,
    accepted_channel_id TEXT,
    denied_channel_id TEXT,
    logs_channel_id TEXT,
    applicant_role_id TEXT,
    under_review_role_id TEXT,
    denied_role_id TEXT,
    required_role_ids TEXT NOT NULL DEFAULT '[]',
    required_role_mode TEXT NOT NULL DEFAULT 'ANY',
    manager_role_ids TEXT NOT NULL DEFAULT '[]',
    ping_role_ids TEXT NOT NULL DEFAULT '[]',
    cooldown_days INTEGER NOT NULL DEFAULT 7,
    time_limit_minutes INTEGER NOT NULL DEFAULT 60,
    warning_minutes INTEGER NOT NULL DEFAULT 10,
    under_review_days INTEGER NOT NULL DEFAULT 7,
    main_embed_message_id TEXT,
    main_embed_channel_id TEXT,
    gif_urls TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_state (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    next_apply_at INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
`);

const CONFIG_COLUMNS = [
  "application_category_id",
  "apply_channel_id",
  "pending_channel_id",
  "accepted_channel_id",
  "denied_channel_id",
  "logs_channel_id",
  "applicant_role_id",
  "under_review_role_id",
  "denied_role_id",
  "required_role_ids",
  "required_role_mode",
  "manager_role_ids",
  "ping_role_ids",
  "cooldown_days",
  "time_limit_minutes",
  "warning_minutes",
  "under_review_days",
  "main_embed_message_id",
  "main_embed_channel_id",
  "gif_urls",
];

const PATCHABLE_APPLICATION_COLUMNS = new Set([
  "started_at",
  "expires_at",
  "submitted_at",
  "under_review_started_at",
  "under_review_ends_at",
  "ready_notified_at",
  "decision_at",
  "decision_by",
  "denial_reason",
  "warning_sent_at",
  "cooldown_until",
  "pending_message_id",
  "pending_thread_id",
]);

function envBaseConfiguration(guildId) {
  const ids = parseIdList;
  return {
    guildId,
    application_category_id: process.env.APPLICATION_CATEGORY_ID || null,
    apply_channel_id: process.env.MAIN_APPLY_CHANNEL_ID || null,
    pending_channel_id: process.env.PENDING_CHANNEL_ID || null,
    accepted_channel_id: process.env.ACCEPTED_CHANNEL_ID || null,
    denied_channel_id: process.env.DENIED_CHANNEL_ID || null,
    logs_channel_id: process.env.APPLICATION_LOGS_CHANNEL_ID || null,
    applicant_role_id: process.env.RH_APPLICANT_ROLE_ID || null,
    under_review_role_id: process.env.RH_UNDER_REVIEW_ROLE_ID || null,
    denied_role_id: process.env.RH_ADMIN_DENIED_ROLE_ID || null,
    required_role_ids: ids(process.env.REQUIRED_ROLE_IDS),
    required_role_mode: process.env.REQUIRED_ROLE_MODE === "ALL" ? "ALL" : "ANY",
    manager_role_ids: ids(process.env.APPLICATION_MANAGER_ROLE_IDS),
    ping_role_ids: ids(process.env.PING_ROLE_IDS),
    cooldown_days: positiveNumber(process.env.DEFAULT_COOLDOWN_DAYS, 7),
    time_limit_minutes: positiveNumber(process.env.APPLICATION_TIME_LIMIT_MINUTES, 60),
    warning_minutes: positiveNumber(process.env.APPLICATION_WARNING_MINUTES, 10),
    under_review_days: positiveNumber(process.env.UNDER_REVIEW_DAYS, 7),
    main_embed_message_id: process.env.MAIN_APPLICATION_MESSAGE_ID || null,
    main_embed_channel_id: process.env.MAIN_APPLY_CHANNEL_ID || null,
    gif_urls: {},
  };
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || "");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeConfiguration(row, guildId) {
  const source = row ? { ...row } : envBaseConfiguration(guildId);
  return {
    guildId,
    applicationCategoryId: source.application_category_id || null,
    applyChannelId: source.apply_channel_id || null,
    pendingChannelId: source.pending_channel_id || null,
    acceptedChannelId: source.accepted_channel_id || null,
    deniedChannelId: source.denied_channel_id || null,
    logsChannelId: source.logs_channel_id || null,
    applicantRoleId: source.applicant_role_id || null,
    underReviewRoleId: source.under_review_role_id || null,
    deniedRoleId: source.denied_role_id || null,
    requiredRoleIds: Array.isArray(source.required_role_ids)
      ? source.required_role_ids
      : parseJson(source.required_role_ids, []),
    requiredRoleMode: source.required_role_mode === "ALL" ? "ALL" : "ANY",
    managerRoleIds: Array.isArray(source.manager_role_ids)
      ? source.manager_role_ids
      : parseJson(source.manager_role_ids, []),
    pingRoleIds: Array.isArray(source.ping_role_ids)
      ? source.ping_role_ids
      : parseJson(source.ping_role_ids, []),
    cooldownDays: positiveNumber(source.cooldown_days, 7),
    timeLimitMinutes: positiveNumber(source.time_limit_minutes, 60),
    warningMinutes: positiveNumber(source.warning_minutes, 10),
    underReviewDays: positiveNumber(source.under_review_days, 7),
    mainEmbedMessageId: source.main_embed_message_id || null,
    mainEmbedChannelId: source.main_embed_channel_id || null,
    gifUrls:
      typeof source.gif_urls === "object" && source.gif_urls
        ? source.gif_urls
        : parseJson(source.gif_urls, {}),
  };
}

function serializeConfiguration(configuration) {
  return {
    application_category_id: configuration.applicationCategoryId || null,
    apply_channel_id: configuration.applyChannelId || null,
    pending_channel_id: configuration.pendingChannelId || null,
    accepted_channel_id: configuration.acceptedChannelId || null,
    denied_channel_id: configuration.deniedChannelId || null,
    logs_channel_id: configuration.logsChannelId || null,
    applicant_role_id: configuration.applicantRoleId || null,
    under_review_role_id: configuration.underReviewRoleId || null,
    denied_role_id: configuration.deniedRoleId || null,
    required_role_ids: JSON.stringify(configuration.requiredRoleIds || []),
    required_role_mode: configuration.requiredRoleMode === "ALL" ? "ALL" : "ANY",
    manager_role_ids: JSON.stringify(configuration.managerRoleIds || []),
    ping_role_ids: JSON.stringify(configuration.pingRoleIds || []),
    cooldown_days: positiveNumber(configuration.cooldownDays, 7),
    time_limit_minutes: positiveNumber(configuration.timeLimitMinutes, 60),
    warning_minutes: positiveNumber(configuration.warningMinutes, 10),
    under_review_days: positiveNumber(configuration.underReviewDays, 7),
    main_embed_message_id: configuration.mainEmbedMessageId || null,
    main_embed_channel_id: configuration.mainEmbedChannelId || null,
    gif_urls: JSON.stringify(configuration.gifUrls || {}),
  };
}

function getConfiguration(guildId) {
  const row = db.prepare("SELECT * FROM configuration WHERE guild_id = ?").get(guildId);
  return normalizeConfiguration(row, guildId);
}

function saveConfiguration(guildId, patch) {
  const current = getConfiguration(guildId);
  const next = { ...current, ...patch, guildId };
  const serialized = serializeConfiguration(next);
  const assignments = CONFIG_COLUMNS.map((column) => `${column} = excluded.${column}`).join(", ");
  db.prepare(`
    INSERT INTO configuration (guild_id, ${CONFIG_COLUMNS.join(", ")}, updated_at)
    VALUES (${["?"].concat(CONFIG_COLUMNS.map(() => "?")).join(", ")}, ?)
    ON CONFLICT(guild_id) DO UPDATE SET ${assignments}, updated_at = excluded.updated_at
  `).run(
    guildId,
    ...CONFIG_COLUMNS.map((column) => serialized[column]),
    Date.now(),
  );
  return getConfiguration(guildId);
}

function getApplicationById(id) {
  return db.prepare("SELECT * FROM applications WHERE id = ?").get(id) || null;
}

function getApplicationByNumber(number) {
  return (
    db.prepare("SELECT * FROM applications WHERE application_number = ?").get(number) || null
  );
}

function getActiveApplicationForUser(guildId, userId) {
  const placeholders = ACTIVE_STATUSES.map(() => "?").join(", ");
  return (
    db
      .prepare(
        `SELECT * FROM applications
         WHERE guild_id = ? AND user_id = ? AND status IN (${placeholders})
         ORDER BY id DESC LIMIT 1`,
      )
      .get(guildId, userId, ...ACTIVE_STATUSES) || null
  );
}

function getLatestApplicationForUser(guildId, userId) {
  return (
    db
      .prepare(
        "SELECT * FROM applications WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(guildId, userId) || null
  );
}

const createApplicationTransaction = db.transaction(({ guildId, userId, timeLimitMinutes }) => {
  const existing = getActiveApplicationForUser(guildId, userId);
  if (existing) return { created: false, application: existing, reason: "already_active" };

  const cooldown = db
    .prepare("SELECT next_apply_at FROM user_state WHERE guild_id = ? AND user_id = ?")
    .get(guildId, userId);
  if (cooldown?.next_apply_at > Date.now()) {
    return { created: false, application: null, reason: "cooldown", cooldownUntil: cooldown.next_apply_at };
  }

  const applicationNumber =
    db.prepare("SELECT COALESCE(MAX(application_number), 0) + 1 AS next FROM applications").get()
      .next;
  const now = Date.now();
  const insert = db
    .prepare(
      `INSERT INTO applications
       (application_number, guild_id, user_id, status, created_at, started_at, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      applicationNumber,
      guildId,
      userId,
      APPLICATION_STATUSES.ACTIVE,
      now,
      now,
      now + timeLimitMinutes * 60_000,
      now,
    );
  return { created: true, application: getApplicationById(insert.lastInsertRowid) };
});

function createApplication(input) {
  return createApplicationTransaction(input);
}

function getAnswers(applicationId) {
  return db
    .prepare(
      "SELECT question_number, question_key, answer, created_at FROM answers WHERE application_id = ? ORDER BY question_number",
    )
    .all(applicationId);
}

function getAnswerCount(applicationId) {
  return db.prepare("SELECT COUNT(*) AS count FROM answers WHERE application_id = ?").get(applicationId)
    .count;
}

function saveAnswer(applicationId, questionNumber, questionKey, answer) {
  return db
    .prepare(
      `INSERT INTO answers (application_id, question_number, question_key, answer, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(application_id, question_number) DO UPDATE SET
         question_key = excluded.question_key,
         answer = excluded.answer,
         created_at = excluded.created_at`,
    )
    .run(applicationId, questionNumber, questionKey, answer, Date.now());
}

function transitionApplication(id, expectedStatuses, status, patch = {}) {
  const expected = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
  const fields = Object.entries(patch).filter(([key]) => PATCHABLE_APPLICATION_COLUMNS.has(key));
  const setSql = ["status = ?", "updated_at = ?"]
    .concat(fields.map(([key]) => `${key} = ?`))
    .join(", ");
  const placeholders = expected.map(() => "?").join(", ");
  const result = db
    .prepare(
      `UPDATE applications SET ${setSql}
       WHERE id = ? AND status IN (${placeholders})`,
    )
    .run(status, Date.now(), ...fields.map(([, value]) => value), id, ...expected);
  return result.changes === 1 ? getApplicationById(id) : null;
}

function updateApplication(id, patch) {
  const fields = Object.entries(patch).filter(([key]) => PATCHABLE_APPLICATION_COLUMNS.has(key));
  if (!fields.length) return getApplicationById(id);
  const setSql = fields.map(([key]) => `${key} = ?`).concat("updated_at = ?").join(", ");
  db.prepare(`UPDATE applications SET ${setSql} WHERE id = ?`).run(
    ...fields.map(([, value]) => value),
    Date.now(),
    id,
  );
  return getApplicationById(id);
}

function setCooldown(guildId, userId, nextApplyAt) {
  db.prepare(
    `INSERT INTO user_state (guild_id, user_id, next_apply_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET
       next_apply_at = excluded.next_apply_at, updated_at = excluded.updated_at`,
  ).run(guildId, userId, nextApplyAt, Date.now());
}

function clearCooldown(guildId, userId) {
  db.prepare(
    "INSERT INTO user_state (guild_id, user_id, next_apply_at, updated_at) VALUES (?, ?, NULL, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET next_apply_at = NULL, updated_at = excluded.updated_at",
  ).run(guildId, userId, Date.now());
}

function getCooldown(guildId, userId) {
  return (
    db
      .prepare("SELECT next_apply_at FROM user_state WHERE guild_id = ? AND user_id = ?")
      .get(guildId, userId)?.next_apply_at || null
  );
}

function listApplicationsForUser(guildId, userId, limit = 10) {
  return db
    .prepare(
      "SELECT * FROM applications WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?",
    )
    .all(guildId, userId, limit);
}

function listApplicationsForRecovery() {
  return db
    .prepare(
      `SELECT * FROM applications
       WHERE status IN (?, ?, ?)
       ORDER BY id`,
    )
    .all(
      APPLICATION_STATUSES.ACTIVE,
      APPLICATION_STATUSES.SUBMITTED,
      APPLICATION_STATUSES.ACCEPTED,
    );
}

function listReadyDeniedCooldowns(now = Date.now()) {
  return db
    .prepare(
      `SELECT * FROM applications
       WHERE status = ? AND cooldown_until IS NOT NULL AND cooldown_until <= ?`,
    )
    .all(APPLICATION_STATUSES.DENIED, now);
}

function listDeniedCooldowns() {
  return db
    .prepare(
      `SELECT * FROM applications
       WHERE status = ? AND cooldown_until IS NOT NULL`,
    )
    .all(APPLICATION_STATUSES.DENIED);
}

function listExpiredActive(now = Date.now()) {
  return db
    .prepare("SELECT * FROM applications WHERE status = ? AND expires_at <= ?")
    .all(APPLICATION_STATUSES.ACTIVE, now);
}

function listAcceptedForReview() {
  return db
    .prepare("SELECT * FROM applications WHERE status = ? ORDER BY under_review_ends_at")
    .all(APPLICATION_STATUSES.ACCEPTED);
}

function listReadyForAdminNotifications() {
  return db
    .prepare(
      "SELECT * FROM applications WHERE status = ? AND ready_notified_at IS NULL ORDER BY under_review_ends_at",
    )
    .all(APPLICATION_STATUSES.READY_FOR_ADMIN_ROLE);
}

function markUserApplicationsLeft(guildId, userId) {
  const departureStatuses = [
    APPLICATION_STATUSES.ACTIVE,
    APPLICATION_STATUSES.SUBMITTED,
    APPLICATION_STATUSES.PENDING,
    APPLICATION_STATUSES.ACCEPTED,
  ];
  const placeholders = departureStatuses.map(() => "?").join(", ");
  return db
    .prepare(
      `UPDATE applications SET status = ?, updated_at = ?
       WHERE guild_id = ? AND user_id = ? AND status IN (${placeholders})`,
    )
    .run(
      APPLICATION_STATUSES.USER_LEFT,
      Date.now(),
      guildId,
      userId,
      ...departureStatuses,
    ).changes;
}

function closeDatabase() {
  if (db.open) db.close();
}

module.exports = {
  db,
  databasePath,
  getConfiguration,
  saveConfiguration,
  getApplicationById,
  getApplicationByNumber,
  getActiveApplicationForUser,
  getLatestApplicationForUser,
  createApplication,
  getAnswers,
  getAnswerCount,
  saveAnswer,
  transitionApplication,
  updateApplication,
  setCooldown,
  clearCooldown,
  getCooldown,
  listApplicationsForUser,
  listApplicationsForRecovery,
  listReadyDeniedCooldowns,
  listDeniedCooldowns,
  listExpiredActive,
  listAcceptedForReview,
  listReadyForAdminNotifications,
  markUserApplicationsLeft,
  closeDatabase,
};
