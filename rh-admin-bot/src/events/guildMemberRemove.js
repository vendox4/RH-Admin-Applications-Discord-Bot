const logger = require("../utils/logger");

async function handleGuildMemberRemove(member, applicationManager) {
  try {
    await applicationManager.handleMemberLeave(member);
  } catch (error) {
    logger.error(`Could not process member departure in guild ${member.guild.id}`, error);
  }
}

module.exports = handleGuildMemberRemove;
