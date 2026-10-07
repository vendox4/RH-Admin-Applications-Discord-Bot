const { COLORS } = require("../config/constants");

function applicationId(applicationNumber) {
  return `RH-${String(applicationNumber).padStart(6, "0")}`;
}

function parseApplicationId(value) {
  const match = /^RH-(\d{1,})$/i.exec(String(value || "").trim());
  return match ? Number(match[1]) : null;
}

function parseIdList(value) {
  return String(value || "")
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().replace(/[<@&#>]/g, ""))
    .filter((entry) => /^\d{17,20}$/.test(entry));
}

function dateText(value) {
  if (!value) return "Not set";
  return new Date(Number(value)).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

function asDiscordTimestamp(value) {
  return value ? `<t:${Math.floor(Number(value) / 1000)}:F>` : "Not set";
}

function statusColor(status) {
  if (status === "ACCEPTED" || status === "READY_FOR_ADMIN_ROLE") return COLORS.accepted;
  if (status === "DENIED" || status === "EXPIRED" || status === "USER_LEFT") return COLORS.denied;
  if (status === "PENDING" || status === "SUBMITTED") return COLORS.pending;
  return COLORS.neutral;
}

function safeText(value, max = 1000) {
  const normalized = String(value ?? "").replace(/\u0000/g, "").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized || "—";
}

function splitText(value, limit = 950) {
  const text = String(value || "—");
  const parts = [];
  for (let i = 0; i < text.length; i += limit) parts.push(text.slice(i, i + limit));
  return parts.length ? parts : ["—"];
}

function listMentions(roleIds) {
  return [...new Set(roleIds || [])].filter((id) => /^\d{17,20}$/.test(id));
}

module.exports = {
  applicationId,
  parseApplicationId,
  parseIdList,
  dateText,
  asDiscordTimestamp,
  statusColor,
  safeText,
  splitText,
  listMentions,
};
