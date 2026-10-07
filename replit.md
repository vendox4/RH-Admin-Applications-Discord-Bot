# Ras El Hanout Admin Applications Bot

A Discord.js bot for private bilingual admin applications, persisted in SQLite with restart-safe timers and staff review.

## Run & Operate

- `pnpm --filter @workspace/rh-admin-bot start` — run the Discord application bot
- `pnpm --filter @workspace/rh-admin-bot dev` — run the bot with Node watch mode
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `DISCORD_TOKEN` — Replit Secret; never commit or print it
- Optional env: `GUILD_ID` for single-server slash command registration and restriction

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `rh-admin-bot/src/` — Discord bot, commands, application flow, and SQLite persistence
- `rh-admin-bot/assets/gifs/` — supplied status GIFs
- `rh-admin-bot/data/` — persistent SQLite database (ignored by Git)
- `rh-admin-bot/docs/application-spec.txt` — original application requirements
- `rh-admin-bot/README.md` — setup, permissions, and operator guide

## Architecture decisions

- The bot token is supplied only through Replit Secrets as `DISCORD_TOKEN`.
- `RH Admin` is manual-only: the bot neither creates nor assigns the role.
- The bot uploads supplied GIFs once to the private logs channel when hosted URLs are not configured.
- Timers and application state are stored in SQLite; timers are restored when the bot reconnects.

## Product

Applicants complete the 16-question Arabic/English application in DMs. Staff review pending submissions, record decisions, and receive a notice when the seven-day Under Review period is complete.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Enable the Discord Server Members and Message Content intents in the Developer Portal.
- Place the bot role above the three bot-managed applicant/review/denied roles.
- Set `GUILD_ID` for fast server-specific command updates; without it, commands register globally.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
