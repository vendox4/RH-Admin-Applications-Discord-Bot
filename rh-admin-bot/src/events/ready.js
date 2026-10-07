const commandDefinitions = require("../commands/definitions");
const logger = require("../utils/logger");

async function handleReady(client, applicationManager) {
  logger.info(`Connected to Discord as ${client.user.tag}.`);
  client.user.setPresence({
    activities: [{ name: "RH Admin Applications" }],
    status: "online",
  });

  const guildId = process.env.GUILD_ID || undefined;
  try {
    const commandManager = client.application.commands;
    const existingCommands = await commandManager.fetch({ guildId });
    for (const definition of commandDefinitions) {
      const existing = existingCommands.find((command) => command.name === definition.name);
      if (existing) {
        await commandManager.edit(existing.id, definition, guildId);
      } else {
        await commandManager.create(definition, guildId);
      }
    }
    if (process.env.CLIENT_ID && process.env.CLIENT_ID !== client.application.id) {
      logger.warn("CLIENT_ID does not match the application linked to DISCORD_TOKEN; the token's application ID is being used.");
    }
    logger.info(
      `Registered ${commandDefinitions.length} slash commands${guildId ? ` for guild ${guildId}` : " globally"}.`,
    );
  } catch (error) {
    logger.error("Slash command registration failed", error);
  }

  await applicationManager.recover();
}

module.exports = handleReady;
