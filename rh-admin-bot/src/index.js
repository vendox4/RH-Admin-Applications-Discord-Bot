const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { Client, Events, GatewayIntentBits, Partials } = require("discord.js");
const ApplicationManager = require("./application/ApplicationManager");
const handleReady = require("./events/ready");
const handleInteractionCreate = require("./events/interactionCreate");
const handleMessageCreate = require("./events/messageCreate");
const handleGuildMemberRemove = require("./events/guildMemberRemove");
const { closeDatabase } = require("./database/database");
const logger = require("./utils/logger");

const token = process.env.DISCORD_TOKEN;
if (!token) {
  logger.error("DISCORD_TOKEN is missing. Add it through Replit Secrets before starting the bot.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember],
});

const applicationManager = new ApplicationManager(client);

client.once(Events.ClientReady, (readyClient) => {
  void handleReady(readyClient, applicationManager).catch((error) => {
    logger.error("Discord ready initialization failed", error);
  });
});

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteractionCreate(interaction, applicationManager);
});

client.on(Events.MessageCreate, (message) => {
  void handleMessageCreate(message, applicationManager);
});

client.on(Events.GuildMemberRemove, (member) => {
  void handleGuildMemberRemove(member, applicationManager);
});

client.on(Events.Error, (error) => logger.error("Discord client error", error));
client.on(Events.Warn, (warning) => logger.warn(`Discord client warning: ${warning}`));

process.on("unhandledRejection", (error) => logger.error("Unhandled promise rejection", error));
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception; shutting down for workflow restart", error);
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}; closing Discord client and SQLite database.`);
  applicationManager.timers.stopAll();
  client.destroy();
  closeDatabase();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

client.login(token).catch((error) => {
  logger.error("Discord login failed; verify the bot token in Replit Secrets.", error);
  process.exit(1);
});
