const path = require("node:path");

const GIF_KEYS = Object.freeze([
  "MAIN_APPLICATION",
  "CONFIRMATION",
  "QUESTION",
  "SUBMITTED",
  "PENDING",
  "ACCEPTED",
  "DENIED",
  "UNDER_REVIEW",
  "EXPIRED",
  "CANCELLED",
  "USER_LEFT",
  "READY_FOR_ADMIN",
]);

const GIF_FILES = Object.freeze(
  Object.fromEntries(
    GIF_KEYS.map((key) => [
      key,
      path.join(__dirname, "..", "..", "assets", "gifs", `${key}_GIF.gif`),
    ]),
  ),
);

function getGifUrl(guildId, key, getConfiguration) {
  const environmentUrl = process.env[`${key}_GIF`];
  if (environmentUrl) return environmentUrl;
  const configuration = getConfiguration(guildId);
  return configuration.gifUrls?.[key] || null;
}

module.exports = { GIF_KEYS, GIF_FILES, getGifUrl };
