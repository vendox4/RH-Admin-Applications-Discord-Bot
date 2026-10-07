const { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const database = require("../database/database");
const QUESTIONS = require("../config/questions");
const { COLORS, FOOTER, APPLICATION_STATUSES } = require("../config/constants");
const {
  applicationId,
  parseApplicationId,
  asDiscordTimestamp,
} = require("../utils/format");
const logger = require("../utils/logger");

function commandEmbed(title, description, color = COLORS.brand) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

function getRoleIds(interaction) {
  return ["role-1", "role-2", "role-3"]
    .map((name) => interaction.options.getRole(name)?.id)
    .filter(Boolean);
}

function renderTranscript(application, answers) {
  const answerMap = new Map(answers.map((answer) => [answer.question_number, answer.answer]));
  const lines = [
    `RAS EL HANOUT — RH ADMIN APPLICATION`,
    `Application: ${applicationId(application.application_number)}`,
    `Discord user ID: ${application.user_id}`,
    `Status: ${application.status}`,
    `Submitted at: ${application.submitted_at ? new Date(application.submitted_at).toISOString() : "Not submitted"}`,
    `Accepted by: ${application.decision_by || "—"}`,
    `Denial reason: ${application.denial_reason || "—"}`,
    "",
  ];
  for (const question of QUESTIONS) {
    lines.push(
      `Question ${question.number} / ${QUESTIONS.length}`,
      "🇸🇦 العربية",
      question.arabic,
      "━━━━━━━━━━━━━━━━━━━━",
      "🇬🇧 English",
      question.english,
      "Applicant answer",
      answerMap.get(question.number) || "No answer recorded",
      "",
    );
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

async function requireStaff(interaction, manager, { guildConfigOnly = false } = {}) {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({ content: "This command is only available inside the server.", ephemeral: true });
    return false;
  }
  if (guildConfigOnly) {
    const allowed =
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (!allowed) {
      await interaction.reply({ content: "Administrator or Manage Server permission is required.", ephemeral: true });
      return false;
    }
    return true;
  }
  const configuration = manager.configuration(interaction.guild.id);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member || !manager.roles.canManageApplications(member, configuration, interaction.channel)) {
    await interaction.reply({ content: "You are not authorized to manage RH applications.", ephemeral: true });
    return false;
  }
  interaction.rhGuildMember = member;
  return true;
}

async function handleAutoconf(interaction, manager) {
  if (!interaction.guild || !interaction.member) {
    return interaction.reply({ content: "Run /autoconf in the server you want to configure.", ephemeral: true });
  }
  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    return interaction.reply({
      content: "Administrator or Manage Server permission is required to run /autoconf.",
      ephemeral: true,
    });
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const configuration = await manager.autoconfigure(interaction.guild);
    const summary = [
      "## RH APPLICATION SYSTEM",
      "✅ Application Category",
      "✅ Apply Channel",
      "✅ Pending Channel",
      "✅ Accepted Channel",
      "✅ Denied Channel",
      "✅ Application Logs",
      "✅ RH Applicant",
      "✅ RH Under Review",
      "✅ RH Admin Denied",
      "⚪ RH Admin — Manual only",
      "",
      "The RH Admin role was not created or assigned. After the 7-day Under Review period, staff must decide manually.",
      "",
      `Apply channel: <#${configuration.applyChannelId}>`,
    ].join("\n");
    await interaction.editReply({ content: summary });
  } catch (error) {
    logger.error("Autoconf failed", error);
    await manager.logEvent(interaction.guild.id, "Configuration error", null, error.message);
    await interaction.editReply({
      content: `Setup could not finish: ${String(error.message || error).slice(0, 1200)}\nCheck the bot's Manage Channels and Manage Roles permissions, then run /autoconf again.`,
    });
  }
}

async function handleConfig(interaction, manager) {
  const subcommand = interaction.options.getSubcommand();
  const requireAdmin =
    subcommand === "manager-roles" ||
    subcommand === "required-roles" ||
    subcommand === "ping-roles";
  if (!(await requireStaff(interaction, manager, { guildConfigOnly: requireAdmin }))) return;
  const guildId = interaction.guild.id;
  if (subcommand === "set-main-embed") {
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.() || !channel.send) {
      return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      database.saveConfiguration(guildId, {
        applyChannelId: channel.id,
        mainEmbedChannelId: channel.id,
      });
      const result = await manager.upsertMainApplicationMessage(interaction.guild);
      await interaction.editReply(`Application message created or updated in <#${result.configuration.mainEmbedChannelId}>.`);
      await manager.logEvent(guildId, "Configuration changes", null, `Main application message set to ${channel.id}.`);
    } catch (error) {
      logger.error("Could not set the main application embed", error);
      await interaction.editReply(`Could not update the application message: ${error.message}`);
    }
    return;
  }

  if (subcommand === "cooldown") {
    const days = interaction.options.getInteger("days", true);
    database.saveConfiguration(guildId, { cooldownDays: days });
    await manager.logEvent(guildId, "Configuration changes", null, `Denial cooldown set to ${days} days.`);
    return interaction.reply({ content: `Denial cooldown set to ${days} days.`, ephemeral: true });
  }

  if (subcommand === "required-roles") {
    const clear = interaction.options.getBoolean("clear") === true;
    const roles = clear ? [] : getRoleIds(interaction);
    if (!clear && roles.length === 0) {
      return interaction.reply({
        content: "Choose at least one required role or set clear to true to remove the requirement.",
        ephemeral: true,
      });
    }
    const mode = interaction.options.getString("mode", true);
    database.saveConfiguration(guildId, { requiredRoleIds: roles, requiredRoleMode: mode });
    await manager.logEvent(guildId, "Configuration changes", null, `Required role mode ${mode}; ${roles.length} role(s).`);
    const description = roles.length
      ? `${mode} of these roles are now required: ${roles.map((id) => `<@&${id}>`).join(", ")}`
      : "Required roles cleared. Any eligible server member may apply.";
    return interaction.reply({ content: description, ephemeral: true, allowedMentions: { parse: [] } });
  }

  if (subcommand === "manager-roles") {
    const clear = interaction.options.getBoolean("clear") === true;
    const roles = clear ? [] : getRoleIds(interaction);
    if (!clear && roles.length === 0) {
      return interaction.reply({
        content: "Add at least one manager role or set clear to true to use staff-channel permissions.",
        ephemeral: true,
      });
    }
    database.saveConfiguration(guildId, { managerRoleIds: roles });
    await manager.syncStaffChannelAccess(interaction.guild, current.managerRoleIds);
    await manager.logEvent(guildId, "Configuration changes", null, `Manager roles updated; ${roles.length} role(s).`);
    return interaction.reply({
      content: roles.length
        ? `Application review is now limited to: ${roles.map((id) => `<@&${id}>`).join(", ")}`
        : "Manager roles cleared. Review access now follows staff-channel permissions.",
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  }

  if (subcommand === "ping-roles") {
    const clear = interaction.options.getBoolean("clear") === true;
    const roles = clear ? [] : getRoleIds(interaction);
    database.saveConfiguration(guildId, { pingRoleIds: roles });
    await manager.logEvent(guildId, "Configuration changes", null, `Submission ping roles updated; ${roles.length} role(s).`);
    return interaction.reply({
      content: roles.length
        ? `These roles will be notified when applications are submitted: ${roles.map((id) => `<@&${id}>`).join(", ")}`
        : "Submission pings are disabled.",
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  }

  return interaction.reply({ content: "Unknown configuration command.", ephemeral: true });
}

async function handleApplication(interaction, manager) {
  if (!(await requireStaff(interaction, manager))) return;
  const guildId = interaction.guild.id;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "status") {
    const user = interaction.options.getUser("user", true);
    const latest = database.getLatestApplicationForUser(guildId, user.id);
    const cooldown = database.getCooldown(guildId, user.id);
    if (!latest) {
      return interaction.reply({
        content: cooldown && cooldown > Date.now()
          ? `No application record found. Cooldown ends <t:${Math.floor(cooldown / 1000)}:F>.`
          : "No application record was found for that user.",
        ephemeral: true,
      });
    }
    const lines = [
      `**Applicant:** <@${user.id}>`,
      `**Application ID:** ${applicationId(latest.application_number)}`,
      `**Status:** ${latest.status}`,
      `**Started:** ${asDiscordTimestamp(latest.started_at)}`,
      `**Submitted:** ${asDiscordTimestamp(latest.submitted_at)}`,
      latest.under_review_ends_at
        ? `**Under Review ends:** ${asDiscordTimestamp(latest.under_review_ends_at)}`
        : null,
      cooldown && cooldown > Date.now()
        ? `**Cooldown ends:** <t:${Math.floor(cooldown / 1000)}:F>`
        : null,
    ].filter(Boolean);
    return interaction.reply({
      embeds: [commandEmbed("RH Application Status", lines.join("\n"), COLORS.neutral)],
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  }

  if (subcommand === "view") {
    const parsedNumber = parseApplicationId(interaction.options.getString("id", true));
    const application = parsedNumber ? database.getApplicationByNumber(parsedNumber) : null;
    if (!application || application.guild_id !== guildId) {
      return interaction.reply({ content: "Application not found in this server.", ephemeral: true });
    }
    const answers = database.getAnswers(application.id);
    const transcript = renderTranscript(application, answers);
    const id = applicationId(application.application_number);
    const file = new AttachmentBuilder(transcript, { name: `${id}-application.txt` });
    return interaction.reply({
      embeds: [
        commandEmbed(
          `Application ${id}`,
          `**Applicant:** <@${application.user_id}>\n**Status:** ${application.status}\n**Answers:** ${answers.length}/${QUESTIONS.length}\n**Submitted:** ${asDiscordTimestamp(application.submitted_at)}\n\nThe attached transcript keeps Arabic and English question blocks separate.`,
          COLORS.neutral,
        ),
      ],
      files: [file],
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  }

  if (subcommand === "reset") {
    const user = interaction.options.getUser("user", true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: "That user is not currently in the server.", ephemeral: true });
    }
    const result = await manager.resetApplicant(interaction.guild, member, interaction.user);
    return interaction.reply({
      content: `${result.message}\nThe manually managed RH Admin role was not changed.`,
      ephemeral: true,
    });
  }

  if (subcommand === "cancel") {
    const number = parseApplicationId(interaction.options.getString("id", true));
    if (!number) {
      return interaction.reply({ content: "Use an application ID such as RH-000123.", ephemeral: true });
    }
    return manager.handleStaffCancel(interaction, number);
  }

  return interaction.reply({ content: "Unknown application command.", ephemeral: true });
}

async function handleCommand(interaction, manager) {
  if (process.env.GUILD_ID && interaction.guildId !== process.env.GUILD_ID) {
    return interaction.reply({ content: "This bot is configured for a different server.", ephemeral: true });
  }
  if (interaction.commandName === "autoconf") return handleAutoconf(interaction, manager);
  if (interaction.commandName === "config") return handleConfig(interaction, manager);
  if (interaction.commandName === "application") return handleApplication(interaction, manager);
}

module.exports = { handleCommand };
