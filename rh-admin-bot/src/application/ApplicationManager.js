const fs = require("node:fs");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const database = require("../database/database");
const QUESTIONS = require("../config/questions");
const { GIF_FILES, GIF_KEYS, getGifUrl } = require("../config/gifs");
const {
  APPLICATION_STATUSES: STATUS,
  CHANNEL_NAMES,
  COLORS,
  FOOTER,
  ROLE_NAMES,
  RTL,
} = require("../config/constants");
const RoleManager = require("./RoleManager");
const TimerManager = require("./TimerManager");
const embeds = require("../embeds");
const logger = require("../utils/logger");
const {
  applicationId,
  listMentions,
  safeText,
} = require("../utils/format");

const DMS_DISABLED_EN = "I couldn't send you a DM. Please enable Direct Messages from this server and try again.";
const DMS_DISABLED_AR = "تعذر عليّ إرسال رسالة خاصة إليك. يرجى تفعيل الرسائل الخاصة من هذا السيرفر ثم حاول مرة أخرى.";

function bilingual(arabic, english) {
  return `${RTL}${arabic}${RTL}\n━━━━━━━━━━━━━━━━━━━━\n${english}`;
}

function button(customId, label, style, emoji) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setEmoji(emoji);
}

function applyRow() {
  return new ActionRowBuilder().addComponents(
    button("rh_apply", "Apply for Admin", ButtonStyle.Primary, "📝"),
  );
}

function confirmationRow(guildId, userId) {
  return new ActionRowBuilder().addComponents(
    button(`rh_confirm_${guildId}_${userId}`, "Confirm Apply", ButtonStyle.Success, "✅"),
    button(`rh_pre_cancel_${guildId}_${userId}`, "Cancel Apply", ButtonStyle.Danger, "❌"),
  );
}

function cancelRow(applicationNumber) {
  return new ActionRowBuilder().addComponents(
    button(`rh_cancel_RH-${String(applicationNumber).padStart(6, "0")}`, "Cancel Application", ButtonStyle.Secondary, "❌"),
  );
}

function reviewRow(applicationNumber) {
  const id = applicationId(applicationNumber);
  return new ActionRowBuilder().addComponents(
    button(`rh_accept_${id}`, "Accept", ButtonStyle.Success, "✅"),
    button(`rh_deny_${id}`, "Deny", ButtonStyle.Danger, "❌"),
  );
}

function cleanInteractionText(value, max = 1800) {
  return String(value || "").replace(/@everyone|@here/g, "@\u200Beveryone").slice(0, max);
}

const BOT_CHANNEL_ACCESS = {
  ViewChannel: true,
  SendMessages: true,
  EmbedLinks: true,
  AttachFiles: true,
  ReadMessageHistory: true,
  ManageMessages: true,
  ManageThreads: true,
  CreatePublicThreads: true,
};

const STAFF_CHANNEL_ACCESS = { ...BOT_CHANNEL_ACCESS };

class ApplicationManager {
  constructor(client) {
    this.client = client;
    this.roles = new RoleManager(database);
    this.timers = new TimerManager(this);
  }

  configuration(guildId) {
    return database.getConfiguration(guildId);
  }

  async getGuild(guildId) {
    return this.client.guilds.fetch(guildId);
  }

  async getConfiguredChannel(guildId, channelId, label) {
    if (!channelId) throw new Error(`${label} is not configured. Run /autoconf first.`);
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.() || !channel.send) {
      throw new Error(`The configured ${label} channel is missing or is not a text channel.`);
    }
    return channel;
  }

  async logEvent(guildId, event, application = null, detail = null) {
    const message = application
      ? `${event} · ${applicationId(application.application_number)}`
      : event;
    logger.info(message);
    try {
      const configuration = this.configuration(guildId);
      if (!configuration.logsChannelId) return;
      const channel = await this.client.channels.fetch(configuration.logsChannelId).catch(() => null);
      if (!channel?.isTextBased?.() || !channel.send) return;
      await channel.send({
        embeds: [
          embeds.createLogEmbed(
            event,
            application,
            detail,
            guildId,
            (id) => this.configuration(id),
          ),
        ],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      logger.error("Could not write to the application log channel", error);
    }
  }

  async reportError(guildId, title, error, application = null) {
    logger.error(title, error);
    await this.logEvent(guildId, "Error", application, `${title}: ${error?.message || error}`);
  }

  async ensureCategory(guild, configuration) {
    let category =
      (configuration.applicationCategoryId &&
        guild.channels.cache.get(configuration.applicationCategoryId)) ||
      guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildCategory && channel.name === CHANNEL_NAMES.category,
      );

    if (!category) {
      if (process.env.AUTOCONF_CREATE_CHANNELS === "false") {
        throw new Error("The RH APPLICATIONS category is missing and channel creation is disabled.");
      }
      category = await guild.channels.create({
        name: CHANNEL_NAMES.category,
        type: ChannelType.GuildCategory,
        reason: "RH admin application setup",
      });
    }
    return category;
  }

  staffRoleIds(guild, configuration) {
    if (configuration.managerRoleIds.length) {
      return [...new Set(configuration.managerRoleIds)];
    }
    const fromPermissions = guild.roles.cache
      .filter(
        (role) =>
          role.permissions.has(PermissionFlagsBits.ManageMessages) ||
          role.permissions.has(PermissionFlagsBits.ManageGuild) ||
          role.permissions.has(PermissionFlagsBits.Administrator),
      )
      .map((role) => role.id);
    return [...new Set(fromPermissions)];
  }

  channelOverwrites(guild, configuration, isPublic) {
    const botMember = guild.members.me;
    const botRole = botMember?.roles?.highest;
    const botPermissions = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.CreatePublicThreads,
    ];
    const overwrites = [
      {
        id: guild.roles.everyone.id,
        allow: isPublic
          ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
          : [],
        deny: isPublic ? [PermissionFlagsBits.SendMessages] : [PermissionFlagsBits.ViewChannel],
      },
    ];
    if (botRole) overwrites.push({ id: botRole.id, allow: botPermissions });
    for (const roleId of this.staffRoleIds(guild, configuration)) {
      if (roleId === guild.roles.everyone.id || roleId === botRole?.id) continue;
      overwrites.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageThreads,
          PermissionFlagsBits.CreatePublicThreads,
        ],
      });
    }
    return overwrites;
  }

  async ensureTextChannel(guild, category, configuration, channelName, isPublic, configuredId) {
    let channel = (configuredId && guild.channels.cache.get(configuredId)) || null;
    if (channel && channel.type !== ChannelType.GuildText) channel = null;
    if (!channel) {
      channel = guild.channels.cache.find(
        (candidate) =>
          candidate.type === ChannelType.GuildText && candidate.name === channelName,
      );
    }
    const options = {
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: this.channelOverwrites(guild, configuration, isPublic),
      reason: "RH admin application setup",
    };
    if (!channel) {
      if (process.env.AUTOCONF_CREATE_CHANNELS === "false") {
        throw new Error(`The #${channelName} channel is missing and channel creation is disabled.`);
      }
      return guild.channels.create(options);
    }
    await channel.permissionOverwrites.edit(
      guild.roles.everyone,
      isPublic
        ? {
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessages: false,
          }
        : {
            ViewChannel: false,
          },
      "Set RH application channel visibility",
    );
    const botRole = guild.members.me?.roles?.highest;
    if (botRole) {
      await channel.permissionOverwrites.edit(
        botRole,
        BOT_CHANNEL_ACCESS,
        "Allow the RH application bot to manage its channel",
      );
    }
    for (const roleId of this.staffRoleIds(guild, configuration)) {
      if (roleId === guild.roles.everyone.id || roleId === botRole?.id) continue;
      await channel.permissionOverwrites.edit(roleId, STAFF_CHANNEL_ACCESS, "Grant RH application staff access");
    }
    if (channel.parentId !== category.id) await channel.setParent(category.id, { lockPermissions: false });
    return channel;
  }

  async syncGifAssets(guild, configuration) {
    const logChannel = await this.getConfiguredChannel(
      guild.id,
      configuration.logsChannelId,
      "application logs",
    );
    const urls = { ...configuration.gifUrls };
    let recentMessages = null;

    for (const key of GIF_KEYS) {
      if (process.env[`${key}_GIF`] || urls[key]) continue;
      const filePath = GIF_FILES[key];
      if (!fs.existsSync(filePath)) continue;

      const marker = `RH GIF ASSET · ${key}`;
      if (!recentMessages) {
        recentMessages = await logChannel.messages.fetch({ limit: 100 }).catch(() => null);
      }
      const existing = recentMessages?.find((message) => message.content === marker);
      const attachmentUrl = existing?.attachments?.first()?.url;
      if (attachmentUrl) {
        urls[key] = attachmentUrl;
        continue;
      }

      try {
        const message = await logChannel.send({
          content: marker,
          files: [new AttachmentBuilder(filePath, { name: `${key}_GIF.gif` })],
          allowedMentions: { parse: [] },
        });
        const attachment = message.attachments.first();
        if (attachment?.url) {
          urls[key] = attachment.url;
          recentMessages?.set(message.id, message);
        }
      } catch (error) {
        logger.warn(`Could not upload the ${key} animation; set ${key}_GIF to a hosted GIF URL.`);
        logger.error(`GIF upload failed: ${key}`, error);
      }
    }

    return database.saveConfiguration(guild.id, { gifUrls: urls });
  }

  async upsertMainApplicationMessage(guild) {
    let configuration = this.configuration(guild.id);
    if (!configuration.applyChannelId) throw new Error("The apply channel is not configured.");
    let channel = await this.client.channels.fetch(configuration.mainEmbedChannelId || configuration.applyChannelId).catch(() => null);
    if (!channel?.isTextBased?.() || !channel.send) channel = null;
    if (!channel) {
      channel = await this.getConfiguredChannel(guild.id, configuration.applyChannelId, "apply");
    }

    const payload = {
      embeds: [embeds.createMainApplicationEmbed(guild, (id) => this.configuration(id))],
      components: [applyRow()],
      allowedMentions: { parse: [] },
    };
    let message = null;
    if (configuration.mainEmbedMessageId) {
      message = await channel.messages.fetch(configuration.mainEmbedMessageId).catch(() => null);
      if (message && message.channelId !== channel.id) message = null;
    }
    if (message) {
      await message.edit(payload);
    } else {
      message = await channel.send(payload);
    }
    configuration = database.saveConfiguration(guild.id, {
      mainEmbedChannelId: channel.id,
      mainEmbedMessageId: message.id,
    });
    return { configuration, message };
  }

  async autoconfigure(guild) {
    let configuration = this.configuration(guild.id);
    const category = await this.ensureCategory(guild, configuration);
    configuration = database.saveConfiguration(guild.id, {
      applicationCategoryId: category.id,
    });

    const apply = await this.ensureTextChannel(
      guild,
      category,
      configuration,
      CHANNEL_NAMES.apply,
      true,
      configuration.applyChannelId,
    );
    configuration = database.saveConfiguration(guild.id, { applyChannelId: apply.id });

    const pending = await this.ensureTextChannel(
      guild,
      category,
      configuration,
      CHANNEL_NAMES.pending,
      false,
      configuration.pendingChannelId,
    );
    configuration = database.saveConfiguration(guild.id, { pendingChannelId: pending.id });

    const accepted = await this.ensureTextChannel(
      guild,
      category,
      configuration,
      CHANNEL_NAMES.accepted,
      false,
      configuration.acceptedChannelId,
    );
    configuration = database.saveConfiguration(guild.id, { acceptedChannelId: accepted.id });

    const denied = await this.ensureTextChannel(
      guild,
      category,
      configuration,
      CHANNEL_NAMES.denied,
      false,
      configuration.deniedChannelId,
    );
    configuration = database.saveConfiguration(guild.id, { deniedChannelId: denied.id });

    const logs = await this.ensureTextChannel(
      guild,
      category,
      configuration,
      CHANNEL_NAMES.logs,
      false,
      configuration.logsChannelId,
    );
    configuration = database.saveConfiguration(guild.id, { logsChannelId: logs.id });

    configuration = await this.roles.ensureAutomaticRoles(guild, configuration);
    configuration = await this.syncGifAssets(guild, configuration);
    const main = await this.upsertMainApplicationMessage(guild);
    await this.logEvent(guild.id, "Configuration complete", null, "Application channels and automatic roles verified.");
    return { ...main.configuration, categoryId: category.id };
  }

  async syncStaffChannelAccess(guild, previousManagerRoleIds = []) {
    const configuration = this.configuration(guild.id);
    const channelIds = [
      configuration.pendingChannelId,
      configuration.acceptedChannelId,
      configuration.deniedChannelId,
      configuration.logsChannelId,
    ].filter(Boolean);
    const currentStaffRoleIds = new Set(this.staffRoleIds(guild, configuration));
    for (const channelId of channelIds) {
      const channel = await this.client.channels.fetch(channelId).catch(() => null);
      if (!channel?.permissionOverwrites) continue;
      await channel.permissionOverwrites
        .edit(guild.roles.everyone, { ViewChannel: false }, "Keep RH review channels staff-only")
        .catch((error) => logger.warn(`Could not restrict channel ${channelId}: ${error.message}`));
      for (const roleId of previousManagerRoleIds) {
        if (currentStaffRoleIds.has(roleId)) continue;
        await channel.permissionOverwrites
          .edit(
            roleId,
            {
              ViewChannel: null,
              SendMessages: null,
              EmbedLinks: null,
              AttachFiles: null,
              ReadMessageHistory: null,
              ManageMessages: null,
              ManageThreads: null,
              CreatePublicThreads: null,
            },
            "Remove previous RH application manager access",
          )
          .catch((error) => logger.warn(`Could not revoke former staff access from ${channelId}: ${error.message}`));
      }
      const botRole = guild.members.me?.roles?.highest;
      if (botRole) {
        await channel.permissionOverwrites
          .edit(botRole, BOT_CHANNEL_ACCESS, "Allow the RH application bot to manage review channels")
          .catch((error) => logger.warn(`Could not grant bot access to ${channelId}: ${error.message}`));
      }
      for (const roleId of this.staffRoleIds(guild, configuration)) {
        if (roleId === guild.roles.everyone.id || roleId === botRole?.id) continue;
        await channel.permissionOverwrites
          .edit(roleId, STAFF_CHANNEL_ACCESS, "Update RH application manager access")
          .catch((error) => logger.warn(`Could not grant staff access to channel ${channelId}: ${error.message}`));
      }
    }
  }

  eligibilityMessage(ar, en) {
    return bilingual(ar, en);
  }

  async getEligibility(guild, member) {
    const configuration = this.configuration(guild.id);
    if (process.env.GUILD_ID && process.env.GUILD_ID !== guild.id) {
      return { ok: false, message: "This bot is not configured for this server." };
    }
    const active = database.getActiveApplicationForUser(guild.id, member.id);
    if (active) {
      return {
        ok: false,
        message: `You already have an application in progress (${applicationId(active.application_number)} · ${active.status}).`,
      };
    }

    const underReview = await this.roles.getMemberRole(
      guild,
      configuration,
      "underReviewRoleId",
      ROLE_NAMES.underReview,
    );
    if (underReview && member.roles.cache.has(underReview.id)) {
      return { ok: false, message: "You currently have the RH Under Review role." };
    }

    const denied = await this.roles.getMemberRole(guild, configuration, "deniedRoleId", ROLE_NAMES.denied);
    if (denied && member.roles.cache.has(denied.id)) {
      return { ok: false, message: "You currently have the RH Admin Denied role. Please wait for the cooldown or contact staff." };
    }

    if (await this.roles.hasManualAdminRole(member)) {
      return { ok: false, message: "You already have the RH Admin role." };
    }

    const cooldownUntil = database.getCooldown(guild.id, member.id);
    if (cooldownUntil && cooldownUntil > Date.now()) {
      return {
        ok: false,
        message: `You can apply again <t:${Math.floor(cooldownUntil / 1000)}:R>.`,
      };
    }

    if (!configuration.applyChannelId || !configuration.applicantRoleId || !configuration.underReviewRoleId) {
      return { ok: false, message: "The application system is not set up yet. Please contact server staff." };
    }

    const requiredRoles = configuration.requiredRoleIds;
    if (requiredRoles.length) {
      const hasRequiredRole =
        configuration.requiredRoleMode === "ALL"
          ? requiredRoles.every((roleId) => member.roles.cache.has(roleId))
          : requiredRoles.some((roleId) => member.roles.cache.has(roleId));
      if (!hasRequiredRole) {
        return {
          ok: false,
          message:
            configuration.requiredRoleMode === "ALL"
              ? "You do not have all of the required server roles."
              : "You do not have any of the required server roles.",
        };
      }
    }

    return { ok: true };
  }

  async handleApplyButton(interaction) {
    if (!interaction.guild || interaction.channelId !== this.configuration(interaction.guild.id).applyChannelId) {
      return interaction.reply({
        content: "Please apply using the application button in the RH apply channel.",
        ephemeral: true,
      });
    }
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: "You need to be a member of this server to apply.", ephemeral: true });
    }
    const eligibility = await this.getEligibility(interaction.guild, member);
    if (!eligibility.ok) {
      return interaction.reply({ content: cleanInteractionText(eligibility.message), ephemeral: true });
    }

    try {
      await interaction.user.send({
        embeds: [
          embeds.createConfirmationEmbed(interaction.guild, (id) => this.configuration(id)),
        ],
        components: [confirmationRow(interaction.guild.id, interaction.user.id)],
        allowedMentions: { parse: [] },
      });
      await this.logEvent(interaction.guild.id, "Application started", null, `Applicant: ${interaction.user.id}`);
      return interaction.reply({
        content: "I sent the application guidelines to your DMs. Confirm there to start the 60-minute timer.",
        ephemeral: true,
      });
    } catch {
      return interaction.reply({
        content: bilingual(DMS_DISABLED_AR, DMS_DISABLED_EN),
        ephemeral: true,
      });
    }
  }

  async handlePreconfirmation(interaction, guildId, userId, confirmed) {
    if (interaction.user.id !== userId || interaction.guild) {
      return interaction.update({
        content: "This confirmation is not for your account.",
        embeds: [],
        components: [],
      });
    }
    if (!confirmed) {
      return interaction.update({
        content: "",
        embeds: [embeds.createCancelledEmbed(guildId, (id) => this.configuration(id))],
        components: [],
      });
    }

    const guild = await this.getGuild(guildId).catch(() => null);
    const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
    if (!guild || !member) {
      return interaction.update({
        content: bilingual("يجب أن تكون عضوًا في السيرفر للتقديم.", "You must be a member of the server to apply."),
        embeds: [],
        components: [],
      });
    }
    const eligibility = await this.getEligibility(guild, member);
    if (!eligibility.ok) {
      return interaction.update({
        content: cleanInteractionText(eligibility.message),
        embeds: [],
        components: [],
      });
    }

    const configuration = this.configuration(guild.id);
    const created = database.createApplication({
      guildId: guild.id,
      userId,
      timeLimitMinutes: configuration.timeLimitMinutes,
    });
    if (!created.created) {
      const explanation =
        created.reason === "cooldown"
          ? `You can apply again <t:${Math.floor(created.cooldownUntil / 1000)}:R>.`
          : "You already have an application in progress.";
      return interaction.update({
        content: cleanInteractionText(explanation),
        embeds: [],
        components: [],
      });
    }

    this.timers.scheduleActive(created.application);
    await this.logEvent(guild.id, "Application confirmed", created.application);
    await interaction
      .update({
        content: bilingual("تم تأكيد طلبك. سيبدأ المؤقت الآن.", "Application confirmed. Your timer has started."),
        embeds: [],
        components: [],
      })
      .catch((error) => logger.warn(`Could not update confirmation message: ${error.message}`));

    try {
      await this.sendQuestion(created.application, QUESTIONS[0]);
    } catch (error) {
      database.transitionApplication(created.application.id, STATUS.ACTIVE, STATUS.CANCELLED);
      this.timers.clearApplication(created.application.id);
      await this.reportError(guild.id, "Could not send the first question", error, created.application);
      await interaction.user
        .send({
          content: bilingual(
            "تعذر إرسال السؤال الأول، لذلك تم إلغاء الجلسة دون تطبيق مهلة انتظار. يرجى المحاولة مرة أخرى.",
            "The first question could not be sent, so the session was cancelled without a cooldown. Please try again.",
          ),
          allowedMentions: { parse: [] },
        })
        .catch(() => null);
    }
  }

  async sendQuestion(application, question) {
    const guild = await this.getGuild(application.guild_id);
    const user = await this.client.users.fetch(application.user_id);
    await user.send({
      embeds: [
        embeds.createQuestionEmbed(question, guild, (id) => this.configuration(id)),
      ],
      components: [cancelRow(application.application_number)],
      allowedMentions: { parse: [] },
    });
  }

  validateAnswer(question, answer) {
    const value = String(answer || "").trim();
    const maxLength = Math.min(
      Number(process.env.MAX_ANSWER_LENGTH) || 4000,
      question.maxLength || 4000,
    );
    if (!value) return { ok: false, ar: "الإجابة مطلوبة.", en: "An answer is required." };
    if (value.length > maxLength) {
      return {
        ok: false,
        ar: `يجب ألا تتجاوز الإجابة ${maxLength} حرفًا.`,
        en: `Your answer must be ${maxLength} characters or fewer.`,
      };
    }

    if (question.type === "steam_url") {
      let url;
      try {
        url = new URL(value);
      } catch {
        return {
          ok: false,
          ar: "يرجى إرسال رابط صالح لملفك الشخصي على Steam.",
          en: "Please send a valid Steam profile URL.",
        };
      }
      const hostIsSteam = ["steamcommunity.com", "www.steamcommunity.com"].includes(
        url.hostname.toLowerCase(),
      );
      const validPath = /^\/(id\/[A-Za-z0-9_-]+|profiles\/\d{17})\/?$/.test(url.pathname);
      if (!["http:", "https:"].includes(url.protocol) || !hostIsSteam || !validPath) {
        return {
          ok: false,
          ar: "يرجى إرسال رابط صالح لملفك الشخصي على Steam.",
          en: "Please send a valid Steam profile URL (steamcommunity.com/id/... or /profiles/...).",
        };
      }
    }

    if (question.type === "number" || question.type === "cs2_hours") {
      if (!/^\d+$/.test(value)) {
        return {
          ok: false,
          ar: "يرجى إدخال رقم صحيح.",
          en: "Please enter a whole number.",
        };
      }
      const number = Number(value);
      if (question.type === "number" && (number < question.min || number > question.max)) {
        return {
          ok: false,
          ar: `يجب أن يكون العمر بين ${question.min} و${question.max}.`,
          en: `Age must be between ${question.min} and ${question.max}.`,
        };
      }
      if (question.type === "cs2_hours" && number < question.min) {
        return {
          ok: false,
          ar: "يتطلب فريق RH Admin حاليًا ما لا يقل عن 1000 ساعة في CS2. يرجى إدخال عدد ساعاتك الفعلي.",
          en: "The RH Admin Team currently requires at least 1000 hours in CS2. Please provide your actual CS2 hours.",
        };
      }
    }
    return { ok: true, value };
  }

  async handleAnswerMessage(message) {
    if (!message.guild && !message.author.bot) {
      // DMs do not include a guild id, so look up the one active session across the bot's guilds.
      for (const guild of this.client.guilds.cache.values()) {
        const active = database.getActiveApplicationForUser(guild.id, message.author.id);
        if (active?.status === STATUS.ACTIVE) {
          await this.processAnswer(message, active);
          return true;
        }
      }
    }
    return false;
  }

  async processAnswer(message, application) {
    if (application.expires_at <= Date.now()) {
      await this.expireApplication(application.id);
      return;
    }
    const answerCount = database.getAnswerCount(application.id);
    const question = QUESTIONS[answerCount];
    if (!question) return;

    const validation = this.validateAnswer(question, message.content);
    if (!validation.ok) {
      await message.reply({
        content: bilingual(validation.ar, validation.en),
        allowedMentions: { parse: [] },
      });
      return;
    }

    database.saveAnswer(application.id, question.number, question.key, validation.value);
    await this.logEvent(
      application.guild_id,
      "Question answered",
      application,
      `Question ${question.number}`,
    );
    const nextQuestion = QUESTIONS[question.number];
    if (nextQuestion) {
      try {
        await this.sendQuestion(application, nextQuestion);
      } catch (error) {
        await this.reportError(application.guild_id, "Could not send the next question", error, application);
        this.timers.schedule(`question:${application.id}`, Date.now() + 15_000, () =>
          this.retryCurrentQuestion(application.id),
        );
      }
      return;
    }
    await this.submitApplication(application.id, message.author);
  }

  async submitApplication(applicationDbId, user) {
    const application = database.transitionApplication(
      applicationDbId,
      STATUS.ACTIVE,
      STATUS.SUBMITTED,
      { submitted_at: Date.now() },
    );
    if (!application) return false;
    this.timers.clearApplication(application.id);
    try {
      await user.send({
        content: bilingual(
          "شكرًا لك! تم إرسال طلبك بنجاح.",
          "Thank you! Your application has been successfully submitted.",
        ),
        embeds: [embeds.createSubmittedEmbed(application.guild_id, (id) => this.configuration(id))],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      logger.warn(`Could not DM applicant ${application.user_id} after submission.`);
      logger.error("Submission confirmation DM failed", error);
    }
    await this.logEvent(application.guild_id, "Submitted", application);
    try {
      await this.publishPendingApplication(application.id);
    } catch (error) {
      await this.reportError(application.guild_id, "Could not publish pending application", error, application);
    }
    return true;
  }

  async retryCurrentQuestion(applicationDbId) {
    const application = database.getApplicationById(applicationDbId);
    if (!application || application.status !== STATUS.ACTIVE) return;
    const question = QUESTIONS[database.getAnswerCount(application.id)];
    if (!question) return;
    try {
      await this.sendQuestion(application, question);
    } catch (error) {
      await this.reportError(application.guild_id, "Could not retry the current question DM", error, application);
      this.timers.schedule(`question:${application.id}`, Date.now() + 60_000, () =>
        this.retryCurrentQuestion(application.id),
      );
    }
  }

  async findExistingPendingMessage(channel, application) {
    if (application.pending_message_id) {
      const message = await channel.messages.fetch(application.pending_message_id).catch(() => null);
      if (message) return message;
    }
    const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    const marker = applicationId(application.application_number);
    return (
      recent?.find((message) =>
        message.embeds.some(
          (embed) =>
            embed.title === "RH ADMIN APPLICATION — PENDING" &&
            embed.description?.includes(marker),
        ),
      ) || null
    );
  }

  async publishPendingApplication(applicationDbId) {
    let application = database.getApplicationById(applicationDbId);
    if (!application || ![STATUS.SUBMITTED, STATUS.PENDING].includes(application.status)) return null;
    const guild = await this.getGuild(application.guild_id);
    const configuration = this.configuration(guild.id);
    const member = await guild.members.fetch(application.user_id).catch(() => null);
    if (!member) {
      const left = database.transitionApplication(
        application.id,
        [STATUS.SUBMITTED, STATUS.PENDING],
        STATUS.USER_LEFT,
      );
      if (left) await this.logEvent(guild.id, "User left", left, "User left the server before review.");
      return null;
    }

    try {
      await this.roles.addApplicantRole(member, configuration, "Application submitted");
      await this.roles.addUnderReviewRole(member, configuration, "Application submitted");
      await this.logEvent(guild.id, "Role changes", application, "Added RH Applicant and RH Under Review.");
    } catch (error) {
      await this.reportError(guild.id, "Could not assign submission roles", error, application);
    }

    const channel = await this.getConfiguredChannel(guild.id, configuration.pendingChannelId, "pending applications");
    let message = await this.findExistingPendingMessage(channel, application);
    if (!message) {
      const pingRoleIds = listMentions(configuration.pingRoleIds);
      message = await channel.send({
        content: pingRoleIds.map((id) => `<@&${id}>`).join(" ") || undefined,
        embeds: [
          embeds.createPendingSummaryEmbed(
            application,
            guild,
            member,
            database.getAnswers(application.id),
            (id) => this.configuration(id),
          ),
        ],
        components: [reviewRow(application.application_number)],
        allowedMentions: { parse: [], roles: pingRoleIds },
      });
    }
    application = database.updateApplication(application.id, { pending_message_id: message.id });

    let thread = null;
    if (application.pending_thread_id) {
      thread = await guild.channels.fetch(application.pending_thread_id).catch(() => null);
    }
    if (!thread && message.hasThread) thread = message.thread;
    if (!thread) {
      try {
        thread = await message.startThread({
          name: `${applicationId(application.application_number)} application answers`,
          autoArchiveDuration: 1440,
          reason: "Keep the application answers together for staff review",
        });
        application = database.updateApplication(application.id, { pending_thread_id: thread.id });
      } catch (error) {
        logger.warn("Could not create an application review thread; posting answer embeds in the pending channel.");
        logger.error("Application thread creation failed", error);
      }
    }

    const detailsChannel = thread || channel;
    const existingMessages = await detailsChannel.messages.fetch({ limit: 100 }).catch(() => null);
    const completedQuestions = new Set();
    existingMessages?.forEach((existingMessage) => {
      for (const embed of existingMessage.embeds) {
        const match = /· Question (\d+)\/\d+/.exec(embed.title || "");
        if (match) completedQuestions.add(Number(match[1]));
      }
    });
    const answers = database.getAnswers(application.id);
    for (const answer of answers) {
      if (completedQuestions.has(answer.question_number)) continue;
      const question = QUESTIONS[answer.question_number - 1];
      await detailsChannel.send({
        embeds: [
          embeds.createAnswerEmbed(
            application,
            question,
            answer.answer,
            answer.question_number - 1,
            (id) => this.configuration(id),
          ),
        ],
        allowedMentions: { parse: [] },
      });
    }

    if (application.status === STATUS.SUBMITTED) {
      application = database.transitionApplication(application.id, STATUS.SUBMITTED, STATUS.PENDING);
    }
    await this.logEvent(guild.id, "Pending review posted", application);
    return message;
  }

  async handleCancelButton(interaction, number) {
    if (!interaction.guild) {
      const application = database.getApplicationByNumber(number);
      if (!application || application.user_id !== interaction.user.id) {
        return interaction.update({
          content: "This cancel button is not for your application.",
          embeds: [],
          components: [],
        });
      }
      const cancelled = database.transitionApplication(application.id, STATUS.ACTIVE, STATUS.CANCELLED);
      if (!cancelled) {
        return interaction.update({
          content: "This application can no longer be cancelled from this button.",
          embeds: [],
          components: [],
        });
      }
      this.timers.clearApplication(application.id);
      await this.logEvent(application.guild_id, "Cancelled", cancelled);
      return interaction.update({
        content: null,
        embeds: [embeds.createCancelledEmbed(application.guild_id, (id) => this.configuration(id))],
        components: [],
      });
    }

    const application = database.getApplicationByNumber(number);
    if (
      !application ||
      application.guild_id !== interaction.guild.id ||
      application.user_id !== interaction.user.id
    ) {
      return interaction.reply({ content: "This cancel button is not for your application.", ephemeral: true });
    }
    const cancelled = database.transitionApplication(application.id, STATUS.ACTIVE, STATUS.CANCELLED);
    if (!cancelled) {
      return interaction.reply({
        content: "This application can no longer be cancelled from this button.",
        ephemeral: true,
      });
    }
    this.timers.clearApplication(application.id);
    await this.logEvent(application.guild_id, "Cancelled", cancelled);
    return interaction.reply({
      embeds: [embeds.createCancelledEmbed(application.guild_id, (id) => this.configuration(id))],
      ephemeral: true,
    });
  }

  async expireApplication(applicationDbId) {
    const application = database.transitionApplication(
      applicationDbId,
      STATUS.ACTIVE,
      STATUS.EXPIRED,
    );
    if (!application) return false;
    this.timers.clearApplication(application.id);
    const user = await this.client.users.fetch(application.user_id).catch(() => null);
    if (user) {
      try {
        const timeLimitMinutes = this.configuration(application.guild_id).timeLimitMinutes;
        await user.send({
          embeds: [
            embeds.createSimpleStatusEmbed(
              "RH ADMIN APPLICATION — EXPIRED",
              `Your ${timeLimitMinutes}-minute application session expired. You may start a new application from the server's apply channel.`,
              COLORS.denied,
              application.guild_id,
              "EXPIRED",
              (id) => this.configuration(id),
            ),
          ],
        });
      } catch {
        logger.warn(`Could not DM applicant ${application.user_id} about expiration.`);
      }
    }
    await this.logEvent(application.guild_id, "Expired", application);
    return true;
  }

  async sendTimerWarning(applicationDbId) {
    const application = database.getApplicationById(applicationDbId);
    if (!application || application.status !== STATUS.ACTIVE || application.warning_sent_at) return;
    const warningMinutes = this.configuration(application.guild_id).warningMinutes;
    try {
      const user = await this.client.users.fetch(application.user_id);
      await user.send({
        content: bilingual(
          `⏰ بقي لديك حوالي ${warningMinutes} دقائق لإكمال طلبك. يرجى إرسال جميع الإجابات قبل انتهاء الوقت.`,
          `⏰ RH ADMIN APPLICATION\nYou have approximately ${warningMinutes} minutes remaining to complete your application. Please submit all remaining answers before the timer expires.`,
        ),
        allowedMentions: { parse: [] },
      });
      const updated = database.updateApplication(application.id, { warning_sent_at: Date.now() });
      await this.logEvent(application.guild_id, "Timer warning", updated);
    } catch (error) {
      this.timers.schedule(`warning:${application.id}`, Date.now() + 60_000, () =>
        this.sendTimerWarning(application.id),
      );
      await this.reportError(application.guild_id, "Could not send timer warning", error, application);
    }
  }

  async disablePendingButtons(application) {
    const configuration = this.configuration(application.guild_id);
    if (!configuration.pendingChannelId || !application.pending_message_id) return;
    const channel = await this.client.channels.fetch(configuration.pendingChannelId).catch(() => null);
    const message = await channel?.messages?.fetch(application.pending_message_id).catch(() => null);
    if (message) await message.edit({ components: [] }).catch(() => null);
  }

  async handleAccept(interaction, applicationNumber) {
    if (!interaction.guild) {
      return interaction.reply({ content: "This action must be used in the server.", ephemeral: true });
    }
    const application = database.getApplicationByNumber(applicationNumber);
    if (!application || application.guild_id !== interaction.guild.id) {
      return interaction.reply({ content: "Application not found in this server.", ephemeral: true });
    }
    const configuration = this.configuration(interaction.guild.id);
    if (process.env.GUILD_ID && interaction.guild.id !== process.env.GUILD_ID) {
      return interaction.reply({ content: "This bot is configured for a different server.", ephemeral: true });
    }
    if (interaction.channelId !== configuration.pendingChannelId) {
      return interaction.reply({ content: "Review buttons only work in the pending applications channel.", ephemeral: true });
    }
    const staffMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!staffMember || !this.roles.canManageApplications(staffMember, configuration, interaction.channel)) {
      return interaction.reply({ content: "You are not authorized to review applications.", ephemeral: true });
    }
    if (application.status !== STATUS.PENDING) {
      return interaction.reply({ content: `This application is already ${application.status}.`, ephemeral: true });
    }
    await interaction.deferUpdate();
    const now = Date.now();
    const accepted = database.transitionApplication(application.id, STATUS.PENDING, STATUS.ACCEPTED, {
      decision_at: now,
      decision_by: interaction.user.id,
      under_review_started_at: now,
      under_review_ends_at: now + configuration.underReviewDays * 86_400_000,
    });
    if (!accepted) {
      return interaction.followUp({
        content: "Another staff member has already decided this application.",
        ephemeral: true,
      });
    }
    this.timers.scheduleReview(accepted);
    await this.disablePendingButtons(accepted);

    const member = await interaction.guild.members.fetch(accepted.user_id).catch(() => null);
    if (member) {
      try {
        await this.roles.addApplicantRole(member, configuration, "Application accepted");
        await this.roles.addUnderReviewRole(member, configuration, "Seven-day review started");
        await this.roles.removeDeniedRole(member, configuration, "Application accepted");
      } catch (error) {
        await this.reportError(interaction.guild.id, "Could not update accepted applicant roles", error, accepted);
      }
    } else {
      database.transitionApplication(accepted.id, STATUS.ACCEPTED, STATUS.USER_LEFT);
      this.timers.clearApplication(accepted.id);
      await this.logEvent(interaction.guild.id, "User left", accepted, "Applicant was no longer in the server at acceptance.");
      return;
    }

    await this.logEvent(
      interaction.guild.id,
      "Role changes",
      accepted,
      "Added RH Applicant and RH Under Review; removed RH Admin Denied when present.",
    );

    try {
      const acceptedChannel = await this.getConfiguredChannel(
        interaction.guild.id,
        configuration.acceptedChannelId,
        "accepted applications",
      );
      await acceptedChannel.send({
        embeds: [
          embeds.createAcceptedChannelEmbed(accepted, interaction.user.id, (id) => this.configuration(id)),
        ],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      await this.reportError(interaction.guild.id, "Could not post accepted application", error, accepted);
    }
    try {
      const user = await this.client.users.fetch(accepted.user_id);
      await user.send({
        embeds: [embeds.createAcceptedDmEmbed(accepted.guild_id, (id) => this.configuration(id))],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      await this.reportError(interaction.guild.id, "Could not DM accepted applicant", error, accepted);
    }
    await this.logEvent(
      interaction.guild.id,
      "Accepted",
      accepted,
      `Staff member: ${interaction.user.id}; 7-day review started.`,
    );
    await this.logEvent(interaction.guild.id, "Under Review started", accepted);
  }

  async openDenialModal(interaction, applicationNumber) {
    if (!interaction.guild) {
      return interaction.reply({ content: "This action must be used in the server.", ephemeral: true });
    }
    const application = database.getApplicationByNumber(applicationNumber);
    if (!application || application.guild_id !== interaction.guild.id || application.status !== STATUS.PENDING) {
      return interaction.reply({ content: "This application is no longer pending.", ephemeral: true });
    }
    const configuration = this.configuration(interaction.guild.id);
    if (process.env.GUILD_ID && interaction.guild.id !== process.env.GUILD_ID) {
      return interaction.reply({ content: "This bot is configured for a different server.", ephemeral: true });
    }
    if (interaction.channelId !== configuration.pendingChannelId) {
      return interaction.reply({ content: "Review buttons only work in the pending applications channel.", ephemeral: true });
    }
    const staffMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!staffMember || !this.roles.canManageApplications(staffMember, configuration, interaction.channel)) {
      return interaction.reply({ content: "You are not authorized to review applications.", ephemeral: true });
    }
    const reason = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Denial Reason")
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(3)
      .setMaxLength(1000)
      .setRequired(true);
    const modal = new ModalBuilder()
      .setCustomId(`rh_deny_reason_${applicationId(applicationNumber)}_${interaction.user.id}`)
      .setTitle("Deny RH Admin Application")
      .addComponents(new ActionRowBuilder().addComponents(reason));
    return interaction.showModal(modal);
  }

  async handleDenialModal(interaction, applicationNumber, expectedStaffId) {
    if (!interaction.guild || interaction.user.id !== expectedStaffId) {
      return interaction.reply({ content: "This denial form is not for your account.", ephemeral: true });
    }
    const application = database.getApplicationByNumber(applicationNumber);
    if (!application || application.guild_id !== interaction.guild.id || application.status !== STATUS.PENDING) {
      return interaction.reply({ content: "This application is no longer pending.", ephemeral: true });
    }
    const configuration = this.configuration(interaction.guild.id);
    if (process.env.GUILD_ID && interaction.guild.id !== process.env.GUILD_ID) {
      return interaction.reply({ content: "This bot is configured for a different server.", ephemeral: true });
    }
    if (interaction.channelId !== configuration.pendingChannelId) {
      return interaction.reply({ content: "Denial forms must be submitted from the pending applications channel.", ephemeral: true });
    }
    const staffMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!staffMember || !this.roles.canManageApplications(staffMember, configuration, interaction.channel)) {
      return interaction.reply({ content: "You are not authorized to review applications.", ephemeral: true });
    }
    const reason = cleanInteractionText(interaction.fields.getTextInputValue("reason"), 1000).trim();
    if (reason.length < 3) {
      return interaction.reply({ content: "Please enter a denial reason.", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const now = Date.now();
    const cooldownUntil = now + configuration.cooldownDays * 86_400_000;
    const denied = database.transitionApplication(application.id, STATUS.PENDING, STATUS.DENIED, {
      decision_at: now,
      decision_by: interaction.user.id,
      denial_reason: reason,
      cooldown_until: cooldownUntil,
    });
    if (!denied) {
      return interaction.editReply("Another staff member has already decided this application.");
    }
    database.setCooldown(denied.guild_id, denied.user_id, cooldownUntil);
    this.timers.scheduleCooldown(denied);
    await interaction.editReply(
      `Application ${applicationId(denied.application_number)} denied. The applicant's RH Admin Denied role will be removed after ${configuration.cooldownDays} days.`,
    );
    await this.disablePendingButtons(denied);

    const member = await interaction.guild.members.fetch(denied.user_id).catch(() => null);
    if (member) {
      try {
        await this.roles.addDeniedRole(member, configuration, "Application denied");
        await this.roles.removeUnderReviewRole(member, configuration, "Application denied");
      } catch (error) {
        await this.reportError(interaction.guild.id, "Could not update denied applicant roles", error, denied);
      }
    }
    try {
      const deniedChannel = await this.getConfiguredChannel(
        interaction.guild.id,
        configuration.deniedChannelId,
        "denied applications",
      );
      await deniedChannel.send({
        embeds: [embeds.createDeniedChannelEmbed(denied, interaction.user.id, (id) => this.configuration(id))],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      await this.reportError(interaction.guild.id, "Could not post denied application", error, denied);
    }
    if (member) {
      try {
        await member.send({
          embeds: [
            embeds.createDeniedDmEmbed(denied.guild_id, reason, (id) => this.configuration(id)),
          ],
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        await this.reportError(interaction.guild.id, "Could not DM denied applicant", error, denied);
      }
    }
    await this.logEvent(
      interaction.guild.id,
      "Denied",
      denied,
      `Denied by ${interaction.user.id}. Reason: ${reason}`,
    );
    await this.logEvent(interaction.guild.id, "Denial reason", denied, reason);
    if (member) {
      await this.logEvent(interaction.guild.id, "Role changes", denied, "Added RH Admin Denied and removed RH Under Review.");
    }
  }

  async completeUnderReview(applicationDbId) {
    const current = database.getApplicationById(applicationDbId);
    if (!current) return false;
    if (current.status === STATUS.READY_FOR_ADMIN_ROLE) {
      return this.notifyReadyForAdmin(current.id);
    }
    if (current.status !== STATUS.ACCEPTED) return false;
    if (current.under_review_ends_at > Date.now()) {
      this.timers.scheduleReview(current);
      return false;
    }
    const ready = database.transitionApplication(
      current.id,
      STATUS.ACCEPTED,
      STATUS.READY_FOR_ADMIN_ROLE,
    );
    if (!ready) return false;
    this.timers.clear(`review:${ready.id}`);
    await this.notifyReadyForAdmin(ready.id);
    return true;
  }

  async notifyReadyForAdmin(applicationDbId) {
    const ready = database.getApplicationById(applicationDbId);
    if (!ready || ready.status !== STATUS.READY_FOR_ADMIN_ROLE || ready.ready_notified_at) return false;
    try {
      const configuration = this.configuration(ready.guild_id);
      const acceptedChannel = await this.getConfiguredChannel(
        ready.guild_id,
        configuration.acceptedChannelId,
        "accepted applications",
      );
      const existingMessages = await acceptedChannel.messages.fetch({ limit: 100 }).catch(() => null);
      const id = applicationId(ready.application_number);
      const existing = existingMessages?.find(
        (message) =>
          message.embeds.some(
            (embed) =>
              embed.title === "RH ADMIN APPLICATION — REVIEW COMPLETE" &&
              embed.description?.includes(id),
          ),
      );
      if (!existing) {
        await acceptedChannel.send({
          embeds: [embeds.createReadyForAdminEmbed(ready, (guildId) => this.configuration(guildId))],
          allowedMentions: { parse: [] },
        });
      }
      database.updateApplication(ready.id, { ready_notified_at: Date.now() });
    } catch (error) {
      this.timers.schedule(`ready-notify:${ready.id}`, Date.now() + 300_000, () =>
        this.notifyReadyForAdmin(ready.id),
      );
      await this.reportError(ready.guild_id, "Could not notify staff that review ended", error, ready);
      return false;
    }
    await this.logEvent(
      ready.guild_id,
      "Under Review completed",
      ready,
      "Applicant is ready for manual RH Admin consideration. No RH Admin role was assigned.",
    );
    return true;
  }

  async releaseDenialCooldown(applicationDbId) {
    const application = database.getApplicationById(applicationDbId);
    if (!application || application.status !== STATUS.DENIED || !application.cooldown_until) return false;
    if (application.cooldown_until > Date.now()) {
      this.timers.scheduleCooldown(application);
      return false;
    }
    const configuration = this.configuration(application.guild_id);
    const guild = await this.getGuild(application.guild_id).catch(() => null);
    if (guild) {
      const member = await guild.members.fetch(application.user_id).catch(() => null);
      if (member) {
        try {
          await this.roles.removeDeniedRole(member, configuration, "Application cooldown ended");
          await this.logEvent(application.guild_id, "Role changes", application, "Removed RH Admin Denied after cooldown.");
        } catch (error) {
          this.timers.schedule(`cooldown:${application.id}`, Date.now() + 300_000, () =>
            this.releaseDenialCooldown(application.id),
          );
          await this.reportError(application.guild_id, "Could not remove denial cooldown role", error, application);
          return false;
        }
      }
    }
    database.clearCooldown(application.guild_id, application.user_id);
    database.updateApplication(application.id, { cooldown_until: null });
    await this.logEvent(application.guild_id, "Denial cooldown completed", application);
    return true;
  }

  async handleStaffCancel(interaction, applicationNumber) {
    if (!interaction.guild) {
      return interaction.reply({ content: "This command must be used in the server.", ephemeral: true });
    }
    const application = database.getApplicationByNumber(applicationNumber);
    if (!application || application.guild_id !== interaction.guild.id) {
      return interaction.reply({ content: "Application not found in this server.", ephemeral: true });
    }
    const configuration = this.configuration(interaction.guild.id);
    const staffMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!staffMember || !this.roles.canManageApplications(staffMember, configuration, interaction.channel)) {
      return interaction.reply({ content: "You are not authorized to cancel applications.", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const cancelled = database.transitionApplication(
      application.id,
      [STATUS.ACTIVE, STATUS.SUBMITTED, STATUS.PENDING],
      STATUS.CANCELLED,
      { decision_at: Date.now(), decision_by: interaction.user.id },
    );
    if (!cancelled) {
      return interaction.editReply(`This application cannot be cancelled from status ${application.status}.`);
    }
    this.timers.clearApplication(application.id);
    await this.disablePendingButtons(cancelled);
    const member = await interaction.guild.members.fetch(cancelled.user_id).catch(() => null);
    if (member) {
      await this.roles.removeApplicantRole(member, configuration, "Application cancelled by staff").catch(() => null);
      await this.roles.removeUnderReviewRole(member, configuration, "Application cancelled by staff").catch(() => null);
      await this.logEvent(interaction.guild.id, "Role changes", cancelled, "Removed RH Applicant and RH Under Review.");
    }
    await this.logEvent(interaction.guild.id, "Cancelled by staff", cancelled, `Staff member: ${interaction.user.id}`);
    return interaction.editReply(
      `Application ${applicationId(application.application_number)} cancelled. No cooldown was applied.`,
    );
  }

  async resetApplicant(guild, user, staff) {
    const latest = database.getLatestApplicationForUser(guild.id, user.id);
    if (!latest) return { ok: false, message: "No application record was found for that user." };
    if ([STATUS.ACCEPTED, STATUS.READY_FOR_ADMIN_ROLE].includes(latest.status)) {
      return {
        ok: false,
        message: "This applicant is in or has completed staff review. Do not reset an accepted application.",
      };
    }

    if ([STATUS.ACTIVE, STATUS.SUBMITTED, STATUS.PENDING, STATUS.DENIED, STATUS.USER_LEFT].includes(latest.status)) {
      const updated = database.transitionApplication(
        latest.id,
        latest.status,
        STATUS.CANCELLED,
        { decision_at: Date.now(), decision_by: staff.id, cooldown_until: null },
      );
      if (updated) this.timers.clearApplication(latest.id);
    }
    await this.disablePendingButtons(latest);
    database.clearCooldown(guild.id, user.id);
    const configuration = this.configuration(guild.id);
    await this.roles.removeDeniedRole(user, configuration, "Application reset by staff").catch(() => null);
    await this.roles.removeUnderReviewRole(user, configuration, "Application reset by staff").catch(() => null);
    await this.roles.removeApplicantRole(user, configuration, "Application reset by staff").catch(() => null);
    await this.logEvent(guild.id, "Application reset", latest, `Reset by ${staff.id}; cooldown and application roles cleared.`);
    return { ok: true, message: `Reset ${applicationId(latest.application_number)}. The user may apply again.` };
  }

  async handleMemberLeave(member) {
    const priorApplications = database.listApplicationsForUser(member.guild.id, member.id, 20);
    const changed = database.markUserApplicationsLeft(member.guild.id, member.id);
    if (!changed) return;
    for (const application of priorApplications) this.timers.clearApplication(application.id);
    const latest = database.getLatestApplicationForUser(member.guild.id, member.id);
    await this.logEvent(
      member.guild.id,
      "User left",
      latest,
      "User left the server. No DM was sent.",
    );
  }

  async recover() {
    await this.timers.recover();
  }
}

module.exports = ApplicationManager;
