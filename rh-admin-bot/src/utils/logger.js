const fs = require("node:fs");
const path = require("node:path");

const logFile = path.resolve(process.cwd(), process.env.LOG_FILE || "./logs/bot.log");
fs.mkdirSync(path.dirname(logFile), { recursive: true });

function write(level, message, error = null) {
  const entry = {
    at: new Date().toISOString(),
    level,
    message: String(message),
    ...(error
      ? {
          error: String(error.message || error),
          stack: error.stack ? String(error.stack).slice(0, 6000) : undefined,
        }
      : {}),
  };
  const line = `${JSON.stringify(entry)}\n`;
  try {
    fs.appendFileSync(logFile, line, { encoding: "utf8", mode: 0o600 });
  } catch {
    // Keep the process observable if the log volume cannot be written.
  }
  const output = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  output(`[${level.toUpperCase()}] ${entry.message}${error ? `: ${entry.error}` : ""}`);
}

module.exports = {
  info: (message) => write("info", message),
  warn: (message) => write("warn", message),
  error: (message, error) => write("error", message, error),
  logFile,
};
