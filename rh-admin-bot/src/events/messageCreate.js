const logger = require("../utils/logger");

async function handleMessageCreate(message, applicationManager) {
  if (message.author.bot || message.guild) return;
  try {
    await applicationManager.handleAnswerMessage(message);
  } catch (error) {
    logger.error("Could not process a DM application answer", error);
    await message
      .reply({
        content:
          "Your answer could not be saved. Please try sending it again. If the problem continues, contact server staff.",
        allowedMentions: { parse: [] },
      })
      .catch(() => null);
  }
}

module.exports = handleMessageCreate;
