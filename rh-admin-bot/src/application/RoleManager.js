const { PermissionFlagsBits } = require("discord.js");
const { ROLE_NAMES } = require("../config/constants");

class RoleManager {
  constructor(database) {
    this.database = database;
  }

  async findRole(guild, roleId, name) {
    if (roleId) {
      const byId = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
      if (byId) return byId;
    }
    return guild.roles.cache.find((role) => role.name === name) || null;
  }

  async ensureAutomaticRoles(guild, configuration) {
    const mappings = [
      ["applicantRoleId", "applicant", ROLE_NAMES.applicant],
      ["underReviewRoleId", "underReview", ROLE_NAMES.underReview],
      ["deniedRoleId", "denied", ROLE_NAMES.denied],
    ];
    const patch = {};
    const mayCreate = process.env.AUTOCONF_CREATE_ROLES !== "false";

    for (const [configKey, envKey, name] of mappings) {
      const role = await this.findRole(guild, configuration[configKey], name);
      const resolved =
        role ||
        (mayCreate
          ? await guild.roles.create({
              name,
              mentionable: false,
              reason: "RH admin application setup",
            })
          : null);
      if (!resolved) throw new Error(`Missing role "${name}" and role creation is disabled.`);
      patch[configKey] = resolved.id;
    }

    return this.database.saveConfiguration(guild.id, patch);
  }

  async getMemberRole(guild, configuration, configKey, name) {
    return this.findRole(guild, configuration[configKey], name);
  }

  async addRole(member, roleId, reason) {
    if (!roleId) throw new Error("A required application role is not configured.");
    const role = member.guild.roles.cache.get(roleId) || (await member.guild.roles.fetch(roleId));
    if (!role) throw new Error(`The configured role ${roleId} no longer exists.`);
    if (!member.roles.cache.has(role.id)) await member.roles.add(role, reason);
    return role;
  }

  async removeRole(member, roleId, reason) {
    if (!roleId || !member.roles.cache.has(roleId)) return false;
    const role = member.guild.roles.cache.get(roleId);
    if (!role) return false;
    await member.roles.remove(role, reason);
    return true;
  }

  async addApplicantRole(member, configuration, reason) {
    return this.addRole(member, configuration.applicantRoleId, reason);
  }

  async removeApplicantRole(member, configuration, reason) {
    return this.removeRole(member, configuration.applicantRoleId, reason);
  }

  async addUnderReviewRole(member, configuration, reason) {
    return this.addRole(member, configuration.underReviewRoleId, reason);
  }

  async removeUnderReviewRole(member, configuration, reason) {
    return this.removeRole(member, configuration.underReviewRoleId, reason);
  }

  async addDeniedRole(member, configuration, reason) {
    return this.addRole(member, configuration.deniedRoleId, reason);
  }

  async removeDeniedRole(member, configuration, reason) {
    return this.removeRole(member, configuration.deniedRoleId, reason);
  }

  async hasManualAdminRole(member) {
    const roleId = process.env.RH_ADMIN_ROLE_ID;
    const role =
      (roleId && member.guild.roles.cache.get(roleId)) ||
      member.guild.roles.cache.find((candidate) => candidate.name === ROLE_NAMES.admin);
    return Boolean(role && member.roles.cache.has(role.id));
  }

  canManageApplications(member, configuration, channel) {
    if (configuration.managerRoleIds.length) {
      return configuration.managerRoleIds.some((roleId) => member.roles.cache.has(roleId));
    }
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const permissions = channel?.permissionsFor(member) || member.permissions;
    return (
      permissions.has(PermissionFlagsBits.ManageMessages) ||
      permissions.has(PermissionFlagsBits.ManageGuild)
    );
  }

  canRunAutoconf(member) {
    return (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild)
    );
  }
}

module.exports = RoleManager;
