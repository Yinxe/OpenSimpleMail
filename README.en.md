# OpenSimpleMail

A quiet, self-hosted webmail client for all your mailboxes.

OpenSimpleMail lets you manage multiple IMAP/SMTP accounts in one place: a unified inbox, folders, search, stars, archive, rich-text compose with attachments, and replies — all on your own server. No ads, no tracking, no third-party mail processing.

> 中文文档见 [README.md](README.md)。

![OpenSimpleMail inbox](docs/screenshots/inbox.png)

## Features

- First-run setup wizard: create the administrator and choose the initial site name, registration and demo policy
- Administrator role with a public-registration switch; disabling it hides the sign-up UI and rejects the API server-side
- Account security: change the password (other sessions are revoked), and manage sessions with browser, IP and sign-in time
- Per-user preferences stored server-side: refresh interval, page size, default view, list density, auto-mark-read and remote-image policy
- Multiple IMAP/SMTP accounts with per-account folders and unread counts
- Folder management from the sidebar: create, rename and delete custom folders, or empty the trash; special folders are not deletable
- Unified inbox across all accounts with real pagination, plus a per-account folder tree
- Pagination, search, message previews, explicit read/unread markers with per-row toggles and one-click "mark all read", batch selection with bulk read/archive/delete, star and delete (moves to the server trash when available); archiving and deleting are undoable from the toast
- Three reader views: full HTML, simplified text (images and styling removed, links kept) and verification code; the choice is remembered per browser
- Verification-code detection across the subject and body, preserving letter case, with expiry hints and one-click copy; it runs locally in the browser
- Starred view: flagged mail is collected across folders under "收藏" in the sidebar, where it can be read, un-starred or deleted and searched
- Delete confirmation showing the subject, sender and destination, with a session-only switch to skip later confirmations (also exposed in Settings)
- Rich-text compose, CC/BCC, attachments, per-account plain-text signature, recipient autocomplete, reply/reply-all/forward quoting, automatic copy to Sent, and a five-second undo window before delivery
- Local draft autosave with restore and discard, plus a mirror in the account's IMAP Drafts folder so other clients see it; opening a draft offers "继续编辑" (edit again)
- Encrypted mailbox credentials (AES-256-GCM), scrypt password hashing, HttpOnly sessions
- Server-side HTML sanitization, sandboxed iframe rendering with a strict CSP, remote images blocked by default
- Demo workspace with 20+ seeded emails, so the UI can be explored without credentials
- Responsive three-pane UI, light/dark themes, keyboard shortcuts (`j/k/c/r/a//`), and touch gestures (swipe to archive/star, pull to refresh)
- Unread badges in the tab title and favicon, plus optional desktop notifications for new mail while the tab is in the background
- Biome, Vitest, GitHub Actions, Docker and docker-compose included

## Stack

React 19 · Vite 8 · TypeScript · TanStack Query · React Router · NestJS 12 · better-sqlite3 · ImapFlow · Nodemailer · mailparser · Biome

## Quick start

Requires Node.js 22.12+ and npm 10+.

```bash
git clone <your-repo-url> open-simple-mail
cd open-simple-mail
npm install

cp .env.example .env
openssl rand -base64 32   # put this into APP_SECRET

npm run dev
```

Open <http://localhost:5174> (`WEB_PORT` in `.env`; Vite proxies `/api` to `PORT`). The first visit starts a setup wizard where you create the administrator account and choose the initial system policy; after that you can add a mailbox or try the demo workspace.

### Production

```bash
npm run build
APP_SECRET="$(openssl rand -base64 32)" npm start
# http://localhost:4010 (PORT in .env)
```

The NestJS server serves the built React app, so a single process is enough.

### Docker

```bash
cp .env.example .env
# set APP_SECRET
docker compose up -d --build
```

If the Debian mirrors are slow from your network, point the build at another one:

```bash
docker compose build --build-arg APT_MIRROR=mirrors.ustc.edu.cn
docker compose up -d
```

Everything lives in the host's `./data` directory, bind-mounted at `/app/data`: the SQLite database and the attachment cache under `attachments/`.

- Back it up with `cp -a data data.bak`; `docker compose down` (even with `-v`) leaves it alone because no named volume is involved.
- The container starts as root, takes ownership of `./data` for the image's `node` user (uid 1000) and immediately drops privileges, so the mount works whatever user owns the host directory. Only override `user:` in compose if you chown it yourself.
- Attachments need no separate mount: uploads and extracted attachments live in `./data/attachments`, are removed once they are no longer needed, and administrators can inspect and clear them from Settings → Attachment cache.
- Local development and Docker share `./data`; do not run both at the same time.

Migrating from the old named volume:

```bash
docker compose down
VOLUME=$(docker volume ls --format '{{.Name}}' | grep open-simple-mail-data | head -1)
mkdir -p data
docker run --rm -v "$VOLUME":/from -v "$PWD/data":/to alpine cp -a /from/. /to/
```

## First-run setup and roles

A fresh installation redirects to `/setup`. The wizard creates the first administrator and stores the initial site name, public-registration flag and demo flag. Until setup is complete, application APIs return `412 Precondition Failed`; only health, public config and the setup endpoint are reachable.

Administrators can change these options later under **Settings → System settings**:

- **Allow public registration** — when off, `/register` shows a closed notice, the register link is hidden and `POST /api/auth/register` returns 403.
- **Enable demo mailbox** — controls the “Try the demo mailbox” button.
- **Site name** — shown on the login page, page titles and settings.

Upgrading an older database promotes the oldest existing user to administrator and keeps registration open, preserving the previous behaviour.

### Recovering a forgotten administrator password

1. Temporarily set `ADMIN_RECOVERY_PASSWORD` (12+ characters) in `.env` or the Compose environment.
2. Restart the service. A “Forgot admin password?” link appears on the login page.
3. Enter the administrator email, the recovery password and a new password. The server verifies the recovery password in constant time, rotates the password, **invalidates every existing session for that account**, and signs you in.
4. Remove `ADMIN_RECOVERY_PASSWORD` and restart again. The recovery endpoint is only for `is_admin` accounts; unknown users, non-admin accounts and wrong passwords share one generic error.

### User preferences

**Settings → Preferences** stores these per user in SQLite, so they follow the account across devices:

- automatic refresh interval (off / 15s / 30s / 1m / 5m / 10m) for the message list, unified inbox and folder counts
- page size (20 / 30 / 50 / 100)
- default view (first mailbox or unified inbox)
- list density (comfortable with previews, or compact)
- automatically mark a message as read when opened
- load remote images by default (with a tracking warning)

Disabling automatic refresh still leaves window-focus refresh and the manual refresh button available.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `APP_SECRET` | dev fallback | **Required in production**, 24+ chars. Derives the credential encryption key |
| `PORT` | `4010` | API / production HTTP port; fixed to `4000` inside Docker |
| `WEB_PORT` | `5174` | Vite dev-server port (not used in production or Docker) |
| `HOST` | `0.0.0.0` | Listen address |
| `DATABASE_PATH` | `data/open-simple-mail.db` | SQLite file; relative paths resolve from the repository root, not the cwd |
| `WEB_ORIGIN` | `http://localhost:5174,http://127.0.0.1:5174` | Allowed browser origins, comma separated |
| `DEMO_ENABLED` | `true` | Initial demo flag for a fresh database; after setup the value in Settings wins |
| `MAX_ATTACHMENT_MB` | `25` | Total outgoing attachment limit; also caps a single uploaded file |
| `ATTACHMENT_DIR` | `attachments/` beside the database | Scratch space for uploads and the extracted-attachment cache |
| `ATTACHMENT_CACHE_MB` | `256` | Disk budget for the attachment cache, evicted least-recently-used |
| `SESSION_DAYS` | `30` | Session lifetime |
| `COOKIE_SECURE` | `false` | Set to `true` behind HTTPS |
| `TRUST_PROXY` | `0` | Number of reverse-proxy hops to trust (`1` behind Nginx/Caddy) |
| `ADMIN_RECOVERY_PASSWORD` | empty | Optional emergency admin recovery password (12+ chars). Remove it after use |
| `WEB_DIST` | auto | Custom web build directory |

Most providers require an app-specific password (Gmail, iCloud, Yahoo) or an authorization code (QQ, 163/126). OpenSimpleMail uses standard IMAP/SMTP, so no OAuth app review is needed.

## Security

- The first administrator must be created through `/setup`; application APIs are blocked until initialization completes.
- Public registration can be disabled by an administrator and is enforced by the API, not just hidden in the UI.
- Administrator recovery uses the optional `ADMIN_RECOVERY_PASSWORD` environment variable. A successful recovery rotates the password and invalidates all sessions for that account; remove the variable immediately afterwards.
- Passwords are hashed with scrypt; session tokens are stored as SHA-256 digests in HttpOnly, SameSite=Lax cookies.
- Mailbox passwords are encrypted with AES-256-GCM and never returned by the API.
- Email HTML is sanitized server-side and rendered inside a sandboxed iframe with `default-src 'none'`.
- Remote images are blocked until the reader explicitly opts in.
- Verification-code detection runs entirely in the browser; message bodies are not sent to a third-party service.
- State-changing requests are checked against the configured browser origin; auth endpoints are rate limited.
- This project targets **single-tenant self-hosting**. Do not expose it to untrusted users: arbitrary IMAP hosts create an SSRF surface by design.

See [SECURITY.md](SECURITY.md) for the full threat model and hardening checklist.

## Scripts

```bash
npm run dev        # NestJS watch + Vite
npm run build      # shared + web + server
npm start          # production server
npm run lint       # Biome
npm run typecheck  # all workspaces
npm test           # unit + black-box HTTP e2e tests
npm run check      # lint, typecheck, test, build
```

## License

[MIT](LICENSE) © OpenSimpleMail contributors
