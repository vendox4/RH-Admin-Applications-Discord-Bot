const APPLICATION_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  SUBMITTED: "SUBMITTED",
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  DENIED: "DENIED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  USER_LEFT: "USER_LEFT",
  READY_FOR_ADMIN_ROLE: "READY_FOR_ADMIN_ROLE",
});

const ROLE_NAMES = Object.freeze({
  applicant: "RH Applicant",
  underReview: "RH Under Review",
  denied: "RH Admin Denied",
  admin: "RH Admin",
});

const CHANNEL_NAMES = Object.freeze({
  category: "🛡️ RH APPLICATIONS",
  apply: "📝・apply",
  pending: "🟡・pending-applications",
  accepted: "🟢・accepted-applications",
  denied: "🔴・denied-applications",
  logs: "📋・application-logs",
});

const ACTIVE_STATUSES = [
  APPLICATION_STATUSES.ACTIVE,
  APPLICATION_STATUSES.SUBMITTED,
  APPLICATION_STATUSES.PENDING,
  APPLICATION_STATUSES.ACCEPTED,
  APPLICATION_STATUSES.READY_FOR_ADMIN_ROLE,
];

const COLORS = Object.freeze({
  brand: 0x9b6b32,
  pending: 0xf1c40f,
  accepted: 0x2ecc71,
  denied: 0xe74c3c,
  neutral: 0x5865f2,
  error: 0xe74c3c,
});

const RTL = "\u200F";
const FOOTER = "Ras El Hanout • RH Admin Applications";

module.exports = {
  APPLICATION_STATUSES,
  ACTIVE_STATUSES,
  ROLE_NAMES,
  CHANNEL_NAMES,
  COLORS,
  RTL,
  FOOTER,
};
