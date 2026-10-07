const {
  ChannelType,
  SlashCommandBuilder,
} = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("autoconf")
    .setDescription("Create or reuse the RH application channels and automatic roles."),
  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure RH admin applications.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-main-embed")
        .setDescription("Create or update the application entry message.")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Text channel for the application entry message.")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cooldown")
        .setDescription("Set the reapplication cooldown after a denial.")
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Cooldown length in days.")
            .setMinValue(1)
            .setMaxValue(365)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("required-roles")
        .setDescription("Set the role requirement for applicants.")
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("Whether applicants need any listed role or all listed roles.")
            .setChoices(
              { name: "Any listed role", value: "ANY" },
              { name: "All listed roles", value: "ALL" },
            )
            .setRequired(true),
        )
        .addRoleOption((option) => option.setName("role-1").setDescription("Required role 1"))
        .addRoleOption((option) => option.setName("role-2").setDescription("Required role 2"))
        .addRoleOption((option) => option.setName("role-3").setDescription("Required role 3"))
        .addBooleanOption((option) =>
          option.setName("clear").setDescription("Clear all required roles."),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("manager-roles")
        .setDescription("Set the roles allowed to review applications.")
        .addRoleOption((option) => option.setName("role-1").setDescription("Manager role 1"))
        .addRoleOption((option) => option.setName("role-2").setDescription("Manager role 2"))
        .addRoleOption((option) => option.setName("role-3").setDescription("Manager role 3"))
        .addBooleanOption((option) =>
          option.setName("clear").setDescription("Use staff-channel permissions instead."),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ping-roles")
        .setDescription("Set roles to notify when an application is submitted.")
        .addRoleOption((option) => option.setName("role-1").setDescription("Role to notify 1"))
        .addRoleOption((option) => option.setName("role-2").setDescription("Role to notify 2"))
        .addRoleOption((option) => option.setName("role-3").setDescription("Role to notify 3"))
        .addBooleanOption((option) => option.setName("clear").setDescription("Clear all ping roles.")),
    ),
  new SlashCommandBuilder()
    .setName("application")
    .setDescription("Review RH admin applications.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Show an applicant's latest application status.")
        .addUserOption((option) =>
          option.setName("user").setDescription("Applicant to check.").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View an application and download its full bilingual transcript.")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("Application ID, for example RH-000123.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Clear an applicant's cooldown and application roles.")
        .addUserOption((option) =>
          option.setName("user").setDescription("Applicant to reset.").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Cancel an active or pending application.")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("Application ID, for example RH-000123.")
            .setRequired(true),
        ),
    ),
].map((command) => command.toJSON());

module.exports = commands;
