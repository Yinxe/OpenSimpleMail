# Contributing to OpenSimpleMail

Thanks for taking the time to improve OpenSimpleMail. This document covers the local workflow, coding conventions and review checklist.

## Development setup

```bash
git clone <your-fork>
cd open-simple-mail
npm install
cp .env.example .env
# set APP_SECRET (24+ chars)
npm run dev
```

- Web dev server: <http://localhost:5174> (`WEB_PORT` in `.env`)
- API: <http://localhost:4010/api> (`PORT` in `.env`)
- Demo login: create a workspace from the login page (no mailbox needed)

## Repository layout

- `apps/server` — NestJS API, IMAP/SMTP adapters, SQLite, demo provider
- `apps/web` — React 19 + Vite client
- `packages/shared` — API DTOs shared by both sides
- `apps/server/test` — black-box HTTP end-to-end tests that spawn the real server

## Quality gates

Before opening a pull request, run:

```bash
npm run check   # lint -> typecheck -> test -> build
```

Individually:

```bash
npm run lint       # Biome check (format + lint + import order)
npm run lint:fix   # apply safe fixes
npm run typecheck
npm test
```

The CI workflow runs the same commands on Node 24.

## Code conventions

- TypeScript strict mode everywhere; no `any` unless unavoidable and commented.
- Comments and identifiers in English. User-facing UI strings are currently Chinese.
- Keep React components focused; extract subcomponents when a render function grows.
- API response shapes live in `packages/shared/src/index.ts`; keep server DTOs and the shared types in sync.
- Formatting is owned by Biome (2-space indent, single quotes, no semicolons, 100 columns). Do not hand-format.

### NestJS dependency injection

The server uses `emitDecoratorMetadata`. TypeScript's `import type` erases the runtime class reference, which breaks constructor injection and `@Body()` / `@Query()` DTO validation.

- Use **value imports** for injected providers (`AuthService`, `ImapPool`, …) and for DTO classes used in decorators.
- `biome.json` disables `useImportType` under `apps/server/**` for this reason. Do not re-enable it there.
- Type-only imports are fine for interfaces, shared DTO types and manually instantiated helpers.

### Database

The schema is defined in `apps/server/src/core/database.service.ts` and applied with `CREATE TABLE IF NOT EXISTS`. There is no migration runner yet:

- Additive changes (new columns with defaults / new tables) are acceptable in the schema block.
- Destructive or data-transforming changes need a small, idempotent migration and a note in the PR.

### Security-sensitive code

Changes touching authentication, encryption, HTML sanitization, the email iframe CSP, or file download headers need extra review. Add or update tests under `apps/server/src/**/*.spec.ts` and explain the threat model in the PR.

## Commit messages

Short imperative subject line, optional body explaining the “why”. Examples:

```
Add unified inbox account filter
Fix remote image CSP in the email iframe
```

Keep unrelated changes in separate commits when practical.

## Pull requests

- Describe the user-visible change and how you tested it.
- Include screenshots for UI changes.
- Note any new environment variables or database changes.
- Make sure the PR is focused; large refactors should be discussed in an issue first.

## Adding a provider preset

Presets are UI-only (`apps/web/src/components/AccountDialog.tsx`). Use the provider's documented IMAP/SMTP endpoints and note whether an app password is required. Do not add presets for providers that require OAuth-only access without documenting the limitation.

## License

By contributing you agree that your contributions are licensed under the MIT License.
