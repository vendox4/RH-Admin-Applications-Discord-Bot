# Ras El Hanout — RH Admin Application Bot

A Discord.js v14 bot for private, bilingual admin applications, staff review, and a persisted seven-day Under Review period. Applications, answers, cooldowns, and deadlines are stored in SQLite and restored after restarts.

## Keep the bot token secret

- In Replit, add the bot token as a Secret named `DISCORD_TOKEN`.
- Never put the real token in JavaScript, `package.json`, `.env.example`, screenshots, or chat.
- A local `.env` is ignored by Git. For local use, copy `.env.example` to `.env` and enter the token only in that ignored file.

## Discord application setup

1. Create a bot application in the Discord Developer Portal and invite it with the `bot` and `applications.commands` scopes.
2. Enable the **Server Members Intent** and **Message Content Intent** on the Bot page. These are needed for member-leave tracking and normal-text DM answers.
3. Give the bot permission to manage channels and roles, send messages, embed links, attach files, read message history, manage messages, and create/manage threads.
4. Place the bot's highest role above `RH Applicant`, `RH Under Review`, and `RH Admin Denied`.
5. Add `DISCORD_TOKEN` with Replit Secrets. `GUILD_ID` is optional: setting it registers commands immediately to one server and restricts the bot to it; leaving it blank registers global commands, which can take time to appear.
6. Start the **RH Admin Bot** workflow, then run `/autoconf` in the target server as an administrator or a member with Manage Server.

The bot reads the application ID from its token. `CLIENT_ID` is optional and, if supplied, is only checked against that ID.

## Run

From the workspace root:

```sh
pnpm --filter @workspace/rh-admin-bot start
```

For local development:

```sh
pnpm --filter @workspace/rh-admin-bot dev
```

SQLite defaults to `data/rh_applications.sqlite`; the bot writes operational logs to `logs/bot.log`. Both are ignored by Git. Keep the persistent data directory when moving or backing up the bot.

## Application flow

- The public apply channel sends applicants the guidelines in DMs. The 60-minute timer starts only after they confirm.
- Applicants answer 16 questions with regular DM text. Arabic appears above English in separate embed fields. Every question has a cancel button.
- CS2 hours must be at least 1000. Steam profile links and numeric age/hour answers are validated.
- Submission adds `RH Applicant` and `RH Under Review`, then posts a pending review card and a thread with all answers.
- Accepting starts the seven-day Under Review period, keeps those two roles, sends the supplied acceptance message, and records the reviewing staff member.
- Denial asks for a reason, adds `RH Admin Denied`, removes `RH Under Review`, and applies the configured reapplication cooldown.
- When the seven-day period ends, staff are notified and the status becomes `READY_FOR_ADMIN_ROLE`. A staff member must make any final role decision manually.
- **The bot never creates or assigns `RH Admin`.**

## Slash commands

- `/autoconf` — safely reuse or create the application category, five channels, and three automatic roles; updates the main application message instead of duplicating it.
- `/config set-main-embed` — create or edit the application entry message.
- `/config cooldown` — set denial cooldown days.
- `/config required-roles` — configure ANY/ALL required roles.
- `/config manager-roles` — limit review actions to specified roles; clearing the list returns to staff-channel permission checks.
- `/config ping-roles` — select roles to notify on submission. `@everyone` and `@here` are never included.
- `/application status user` — inspect the latest status.
- `/application view id` — download a full bilingual transcript.
- `/application reset user` — clear an eligible applicant's application roles and cooldown; accepted/review-complete applications cannot be reset.
- `/application cancel id` — cancel an active or pending application without a cooldown.

`/autoconf` applies staff-only visibility to the pending, accepted, denied, and logs channels, and makes the apply channel viewable but read-only for everyone. On existing channels it changes only the relevant `@everyone`, bot, and staff-role overwrites; unrelated overwrites are left in place. Existing extra role access may therefore remain and should be reviewed by server administrators.

## GIFs

The provided GIFs are included in `assets/gifs/`. When no hosted URL is set in the environment, `/autoconf` uploads each GIF once to the private logs channel and stores the resulting URLs in SQLite. Hosted URLs in environment variables take precedence.
