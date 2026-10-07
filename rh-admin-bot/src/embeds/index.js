const { EmbedBuilder } = require("discord.js");
const QUESTIONS = require("../config/questions");
const { getGifUrl } = require("../config/gifs");
const { COLORS, FOOTER, RTL } = require("../config/constants");
const {
  applicationId,
  asDiscordTimestamp,
  safeText,
  splitText,
  statusColor,
} = require("../utils/format");

function baseEmbed(color = COLORS.brand) {
  return new EmbedBuilder().setColor(color).setFooter({ text: FOOTER }).setTimestamp();
}

function addGif(embed, guildId, key, getConfiguration) {
  const url = getGifUrl(guildId, key, getConfiguration);
  if (url) embed.setImage(url);
  return embed;
}

function createQuestionEmbed(question, guild, getConfiguration) {
  const embed = baseEmbed(COLORS.brand)
    .setTitle("RH ADMIN APPLICATION")
    .setDescription(`**Question ${question.number} / ${QUESTIONS.length}**`)
    .addFields(
      {
        name: "🇸🇦 العربية",
        value: `${RTL}${question.arabic}${RTL}`.slice(0, 1024),
      },
      { name: "━━━━━━━━━━━━━━━━━━━━", value: "\u200B" },
      { name: "🇬🇧 English", value: question.english.slice(0, 1024) },
    );

  const icon = guild?.iconURL({ extension: "png", size: 256 });
  if (icon) embed.setThumbnail(icon);
  return addGif(embed, guild.id, "QUESTION", getConfiguration);
}

function createConfirmationEmbed(guild, getConfiguration) {
  const timeLimit = getConfiguration(guild.id).timeLimitMinutes;
  const timeLabel = timeLimit === 60 ? "exactly 1 hour" : `${timeLimit} minutes`;
  const embed = baseEmbed(COLORS.brand)
    .setTitle("Application Guidelines & Confirmation")
    .setDescription(
      [
        "Before proceeding, please review the following conditions:",
        "• Format: The application consists of a series of questions.",
        `• Time Limit: You have ${timeLabel} to complete and submit your responses.`,
        "• Session Expiration: If the time limit is exceeded, your session will time out and must be restarted.",
        '• Cancellation: Select "Cancel Apply" at any time to abort.',
        "",
        "Do you wish to proceed?",
      ].join("\n"),
    );
  const icon = guild?.iconURL({ extension: "png", size: 256 });
  if (icon) embed.setThumbnail(icon);
  return addGif(embed, guild.id, "CONFIRMATION", getConfiguration);
}

function createMainApplicationEmbed(guild, getConfiguration) {
  const embed = baseEmbed(COLORS.brand)
    .setTitle("RAS EL HANOUT — ADMIN APPLICATION")
    .setDescription(
      [
        "Interested in joining the RH Admin Team?",
        "If you have the experience, activity, maturity, and technical knowledge to help manage the server, you can submit an application below.",
        "Please answer every question honestly and provide detailed answers where requested.",
        "",
        "**Requirements**",
        "• Minimum 1000 hours in CS2",
        "• Active on the RH server",
        "• Active in the RH Discord",
        "• Professional behavior",
        "• Server administration knowledge is strongly preferred",
        "• Ability to handle situations fairly and responsibly",
      ].join("\n"),
    );
  const icon = guild?.iconURL({ extension: "png", size: 256 });
  if (icon) embed.setThumbnail(icon);
  return addGif(embed, guild.id, "MAIN_APPLICATION", getConfiguration);
}

function createSimpleStatusEmbed(title, description, color, guildId, gifKey, getConfiguration) {
  return addGif(
    baseEmbed(color).setTitle(title).setDescription(description),
    guildId,
    gifKey,
    getConfiguration,
  );
}

function createSubmittedEmbed(guildId, getConfiguration) {
  return createSimpleStatusEmbed(
    "RH ADMIN APPLICATION",
    "Your application has been submitted successfully.\nThe RH Admin Team will review your application.\nPlease wait for a decision from the staff team.",
    COLORS.pending,
    guildId,
    "SUBMITTED",
    getConfiguration,
  );
}

function createCancelledEmbed(guildId, getConfiguration) {
  return createSimpleStatusEmbed(
    "RH ADMIN APPLICATION — CANCELLED",
    "Your application was cancelled. You may apply again.",
    COLORS.neutral,
    guildId,
    "CANCELLED",
    getConfiguration,
  );
}

function createAcceptedDmEmbed(guildId, getConfiguration) {
  return createSimpleStatusEmbed(
    "RH ADMIN APPLICATION",
    "We’re pleased to inform you that your application for the RH Admin Team has been accepted. 🎉\n\nCongratulations, and welcome to the RH Admin Team! ❤️\n\nA staff member will contact you shortly with further information regarding the next steps, your responsibilities, and the trial period.\n\nPlease remember that being an admin is a responsibility, not a status. Treat every player fairly, use your permissions responsibly, and represent the RH community with professionalism. 💎\n\nWelcome to the team, and we wish you the best of luck!",
    COLORS.accepted,
    guildId,
    "ACCEPTED",
    getConfiguration,
  );
}

function createDeniedDmEmbed(guildId, reason, getConfiguration) {
  return addGif(
    baseEmbed(COLORS.denied)
      .setTitle("RH ADMIN APPLICATION")
      .setDescription(
        "Thank you for taking the time to apply for the RH Admin Team and for your interest in helping our community. ❤️\n\nAfter reviewing your application, we’re unfortunately unable to accept it at this time.\n\nPlease don’t take this as a final decision. You’re welcome to apply again in the future once you’ve gained more experience or meet the requirements. We’d be happy to review your application again when the time is right.\n\nWe truly appreciate your interest in RH and the effort you put into your application. We wish you the best, and we hope to see you apply again in the future. ❤️",
      )
      .addFields({ name: "Staff Reason", value: safeText(reason, 1024) }),
    guildId,
    "DENIED",
    getConfiguration,
  );
}

function createPendingSummaryEmbed(application, guild, applicant, answers, getConfiguration) {
  const byKey = Object.fromEntries(answers.map((answer) => [answer.question_key, answer.answer]));
  const embed = addGif(
    baseEmbed(COLORS.pending)
      .setTitle("RH ADMIN APPLICATION — PENDING")
      .setDescription(
        [
          `**Application ID:** ${applicationId(application.application_number)}`,
          `**Applicant:** <@${application.user_id}>`,
          `**Discord ID:** \`${application.user_id}\``,
          `**Submitted:** <t:${Math.floor(application.submitted_at / 1000)}:F>`,
          "**Status:** PENDING",
          "",
          "Full answers are in the application review thread.",
        ].join("\n"),
      )
      .addFields(
        { name: "Steam profile", value: safeText(byKey.steam_profile, 1024) },
        { name: "Age", value: safeText(byKey.age, 100), inline: true },
        { name: "CS2 hours", value: safeText(byKey.cs2_hours, 100), inline: true },
      ),
    application.guild_id,
    "PENDING",
    getConfiguration,
  );
  const icon = guild?.iconURL({ extension: "png", size: 256 });
  if (icon) embed.setThumbnail(icon);
  return embed;
}

function createAnswerEmbed(application, question, answer, index, getConfiguration) {
  const chunks = splitText(answer, 900);
  const fields = [
    { name: "🇸🇦 العربية", value: `${RTL}${question.arabic}${RTL}`.slice(0, 1024) },
    { name: "━━━━━━━━━━━━━━━━━━━━", value: "\u200B" },
    { name: "🇬🇧 English", value: question.english.slice(0, 1024) },
    ...chunks.map((part, i) => ({
      name: chunks.length === 1 ? "Applicant answer" : `Applicant answer · part ${i + 1}/${chunks.length}`,
      value: part,
    })),
  ];
  return addGif(
    baseEmbed(COLORS.neutral)
      .setTitle(`${applicationId(application.application_number)} · Question ${index + 1}/${QUESTIONS.length}`)
      .addFields(fields),
    application.guild_id,
    "PENDING",
    getConfiguration,
  );
}

function createAcceptedChannelEmbed(application, staffId, getConfiguration) {
  return addGif(
    baseEmbed(COLORS.accepted)
      .setTitle("RH ADMIN APPLICATION — ACCEPTED")
      .setDescription(
        [
          `**Applicant:** <@${application.user_id}>`,
          `**Application ID:** ${applicationId(application.application_number)}`,
          "**Status:** UNDER REVIEW",
          `**Under Review Started:** ${asDiscordTimestamp(application.under_review_started_at)}`,
          `**Under Review Ends:** ${asDiscordTimestamp(application.under_review_ends_at)}`,
          `**Accepted By:** <@${staffId}>`,
          "",
          "Acceptance begins the 7-day Under Review period. This applicant is not yet an RH Admin.",
        ].join("\n"),
      ),
    application.guild_id,
    "UNDER_REVIEW",
    getConfiguration,
  );
}

function createDeniedChannelEmbed(application, staffId, getConfiguration) {
  return addGif(
    baseEmbed(COLORS.denied)
      .setTitle("RH ADMIN APPLICATION — DENIED")
      .setDescription(
        [
          `**Applicant:** <@${application.user_id}>`,
          `**Application ID:** ${applicationId(application.application_number)}`,
          `**Denied By:** <@${staffId}>`,
          `**Date:** <t:${Math.floor(application.decision_at / 1000)}:F>`,
          `**Status:** DENIED`,
        ].join("\n"),
      )
      .addFields({ name: "Reason", value: safeText(application.denial_reason, 1024) }),
    application.guild_id,
    "DENIED",
    getConfiguration,
  );
}

function createReadyForAdminEmbed(application, getConfiguration) {
  return addGif(
    baseEmbed(COLORS.accepted)
      .setTitle("RH ADMIN APPLICATION — REVIEW COMPLETE")
      .setDescription(
        [
          `**Applicant:** <@${application.user_id}>`,
          `**Application ID:** ${applicationId(application.application_number)}`,
          "**7-Day Under Review:** COMPLETED",
          "**Status:** READY FOR MANUAL RH ADMIN ASSIGNMENT",
          "The applicant has completed the required Under Review period.",
          "Staff must manually decide whether to assign the RH Admin role.",
          "",
          "The bot will not create or assign the RH Admin role.",
        ].join("\n"),
      ),
    application.guild_id,
    "READY_FOR_ADMIN",
    getConfiguration,
  );
}

function createApplicationSummaryEmbed(application, answers) {
  const answerMap = Object.fromEntries(answers.map((answer) => [answer.question_number, answer.answer]));
  return baseEmbed(statusColor(application.status))
    .setTitle(`Application ${applicationId(application.application_number)}`)
    .setDescription(
      [
        `**Applicant:** <@${application.user_id}>`,
        `**Discord ID:** \`${application.user_id}\``,
        `**Status:** ${application.status}`,
        `**Submitted:** ${asDiscordTimestamp(application.submitted_at)}`,
        application.decision_by ? `**Decision by:** <@${application.decision_by}>` : null,
        application.denial_reason ? `**Denial reason:** ${safeText(application.denial_reason, 1000)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .addFields(
      ...QUESTIONS.map((question) => ({
        name: `Q${question.number} · ${question.key}`,
        value: safeText(answerMap[question.number], 1024),
      })),
    );
}

function createLogEmbed(event, application, detail = null, guildId, getConfiguration) {
  const fields = [];
  if (application) {
    fields.push(
      { name: "Application", value: applicationId(application.application_number), inline: true },
      { name: "Applicant", value: `<@${application.user_id}>`, inline: true },
      { name: "Status", value: application.status, inline: true },
    );
  }
  if (detail) fields.push({ name: "Details", value: safeText(detail, 1024) });
  const gifKey =
    event === "User left"
      ? "USER_LEFT"
      : event.toLowerCase().includes("cancel")
        ? "CANCELLED"
        : event === "Expired"
          ? "EXPIRED"
          : event === "Denied" || event === "Denial reason"
            ? "DENIED"
            : event === "Accepted"
              ? "ACCEPTED"
              : event.toLowerCase().includes("submitted") || event === "Pending review posted"
                ? "PENDING"
                : event === "Under Review completed"
                  ? "READY_FOR_ADMIN"
                  : null;
  const embed = baseEmbed(COLORS.neutral)
    .setTitle(`RH Application Log · ${event}`)
    .addFields(fields.length ? fields : [{ name: "Details", value: "—" }]);
  return gifKey && guildId && getConfiguration
    ? addGif(embed, guildId, gifKey, getConfiguration)
    : embed;
}

module.exports = {
  createQuestionEmbed,
  createConfirmationEmbed,
  createMainApplicationEmbed,
  createSimpleStatusEmbed,
  createSubmittedEmbed,
  createCancelledEmbed,
  createAcceptedDmEmbed,
  createDeniedDmEmbed,
  createPendingSummaryEmbed,
  createAnswerEmbed,
  createAcceptedChannelEmbed,
  createDeniedChannelEmbed,
  createReadyForAdminEmbed,
  createApplicationSummaryEmbed,
  createLogEmbed,
};
