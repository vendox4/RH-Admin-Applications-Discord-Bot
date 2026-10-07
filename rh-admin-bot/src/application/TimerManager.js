const database = require("../database/database");
const QUESTIONS = require("../config/questions");
const logger = require("../utils/logger");

const MAX_TIMEOUT = 2_147_000_000;

class TimerManager {
  constructor(applicationManager) {
    this.applicationManager = applicationManager;
    this.timers = new Map();
  }

  schedule(key, at, callback) {
    this.clear(key);
    const delay = Math.max(0, Math.min(Number(at) - Date.now(), MAX_TIMEOUT));
    const handle = setTimeout(() => {
      this.timers.delete(key);
      Promise.resolve(callback()).catch((error) => {
        logger.error(`Timer callback failed (${key})`, error);
      });
    }, delay);
    this.timers.set(key, handle);
  }

  clear(key) {
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }

  clearApplication(applicationId) {
    this.clear(`expire:${applicationId}`);
    this.clear(`warning:${applicationId}`);
    this.clear(`review:${applicationId}`);
    this.clear(`cooldown:${applicationId}`);
    this.clear(`ready-notify:${applicationId}`);
    this.clear(`question:${applicationId}`);
  }

  scheduleActive(application) {
    const manager = this.applicationManager;
    if (!application.expires_at) return;
    this.schedule(`expire:${application.id}`, application.expires_at, () =>
      manager.expireApplication(application.id),
    );

    const configuration = database.getConfiguration(application.guild_id);
    if (process.env.ENABLE_TIMER_WARNING === "false" || application.warning_sent_at) return;
    const warningAt = application.expires_at - configuration.warningMinutes * 60_000;
    this.schedule(`warning:${application.id}`, warningAt, () =>
      manager.sendTimerWarning(application.id),
    );
  }

  scheduleReview(application) {
    if (!application.under_review_ends_at) return;
    this.schedule(`review:${application.id}`, application.under_review_ends_at, () =>
      this.applicationManager.completeUnderReview(application.id),
    );
  }

  scheduleCooldown(application) {
    if (!application.cooldown_until) return;
    this.schedule(`cooldown:${application.id}`, application.cooldown_until, () =>
      this.applicationManager.releaseDenialCooldown(application.id),
    );
  }

  async recover() {
    for (const application of database.listApplicationsForRecovery()) {
      try {
        if (application.status === "ACTIVE") {
          if (application.expires_at <= Date.now()) {
            await this.applicationManager.expireApplication(application.id);
          } else {
            this.scheduleActive(application);
            const answered = database.getAnswerCount(application.id);
            const question = QUESTIONS[answered];
            if (question) await this.applicationManager.sendQuestion(application, question);
          }
        } else if (application.status === "SUBMITTED") {
          await this.applicationManager.publishPendingApplication(application.id);
        } else if (application.status === "ACCEPTED") {
          if (application.under_review_ends_at <= Date.now()) {
            await this.applicationManager.completeUnderReview(application.id);
          } else {
            this.scheduleReview(application);
          }
        }
      } catch (error) {
        logger.error(`Application recovery failed for ${application.application_number}`, error);
        await this.applicationManager.logEvent(
          application.guild_id,
          "Recovery error",
          application,
          error.message,
        );
      }
    }

    for (const application of database.listDeniedCooldowns()) {
      try {
        if (application.cooldown_until <= Date.now()) {
          await this.applicationManager.releaseDenialCooldown(application.id);
        } else {
          this.scheduleCooldown(application);
        }
      } catch (error) {
        logger.error(`Denial cooldown recovery failed for ${application.application_number}`, error);
      }
    }

    for (const application of database.listReadyForAdminNotifications()) {
      await this.applicationManager.notifyReadyForAdmin(application.id);
    }
  }

  stopAll() {
    for (const handle of this.timers.values()) clearTimeout(handle);
    this.timers.clear();
  }
}

module.exports = TimerManager;
