const { handleCommand } = require("../commands/handler");
const { parseApplicationId } = require("../utils/format");
const logger = require("../utils/logger");

function customApplicationNumber(customId, prefix) {
  if (!customId.startsWith(prefix)) return null;
  return parseApplicationId(customId.slice(prefix.length));
}

async function respondToError(interaction, error) {
  logger.error("Discord interaction failed", error);
  const message = `The request could not be completed: ${String(error?.message || error).slice(0, 700)}`;
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: Boolean(interaction.guild) });
    } else if (interaction.isModalSubmit() || interaction.isButton()) {
      if (interaction.guild) await interaction.reply({ content: message, ephemeral: true });
      else await interaction.update({ content: message, embeds: [], components: [] });
    } else {
      await interaction.reply({ content: message, ephemeral: Boolean(interaction.guild) });
    }
  } catch (replyError) {
    logger.error("Could not return interaction error to user", replyError);
  }
}

async function handleInteractionCreate(interaction, applicationManager) {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction, applicationManager);
      return;
    }

    if (interaction.isButton()) {
      const { customId } = interaction;
      if (customId === "rh_apply") {
        await applicationManager.handleApplyButton(interaction);
        return;
      }

      let match = /^rh_confirm_(\d{17,20})_(\d{17,20})$/.exec(customId);
      if (match) {
        await applicationManager.handlePreconfirmation(interaction, match[1], match[2], true);
        return;
      }
      match = /^rh_pre_cancel_(\d{17,20})_(\d{17,20})$/.exec(customId);
      if (match) {
        await applicationManager.handlePreconfirmation(interaction, match[1], match[2], false);
        return;
      }

      const cancelNumber = customApplicationNumber(customId, "rh_cancel_");
      if (cancelNumber) {
        await applicationManager.handleCancelButton(interaction, cancelNumber);
        return;
      }

      const acceptNumber = customApplicationNumber(customId, "rh_accept_");
      if (acceptNumber) {
        await applicationManager.handleAccept(interaction, acceptNumber);
        return;
      }

      const denyNumber = customApplicationNumber(customId, "rh_deny_");
      if (denyNumber) {
        await applicationManager.openDenialModal(interaction, denyNumber);
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      const match = /^rh_deny_reason_RH-(\d{1,})_(\d{17,20})$/i.exec(interaction.customId);
      if (match) {
        await applicationManager.handleDenialModal(
          interaction,
          Number(match[1]),
          match[2],
        );
      }
    }
  } catch (error) {
    await respondToError(interaction, error);
  }
}

module.exports = handleInteractionCreate;
