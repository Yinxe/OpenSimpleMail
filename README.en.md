# OpenSimpleMail

A quiet, self-hosted webmail client for all your mailboxes.

OpenSimpleMail lets you manage multiple IMAP/SMTP accounts in one place: a unified inbox, folders, search, stars, archive, rich-text compose with attachments, and replies — all on your own server. No ads, no tracking, no third-party mail processing.

> 中文文档见 [README.md](README.md)。

![OpenSimpleMail inbox](docs/screenshots/inbox.png)

## Features

- Multiple IMAP/SMTP accounts with per-account folders and unread counts
- Unified inbox across all accounts, plus a per-account folder tree
- Pagination, search, read/unread, star, archive and delete (moves to the server trash when available)
- Rich-text compose, CC/BCC, attachments, reply/forward quoting, and automatic copy to Sent
- Encrypted mailbox credentials (AES-256-GCM), scrypt password hashing, HttpOnly sessions
- Server-side HTML sanitization, sandboxed iframe rendering with a strict CSP, remote images blocked by default
- Demo workspace with 20+ seeded emails, so the UI can be explored without credentials
- Responsive three-pane UI, light/dark themes, keyboard shortcuts (`j/k/c/r//`)
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

Open <http://localhost:5173>, create a local account, then add a mailbox or click “Try the demo mailbox”.

### Production

```bash
npm run build
APP_SECRET="$(openssl rand -base64 32)" npm start
# http://localhost:4000
```

The NestJS server serves the built React app, so a single process is enough.

### Docker

```bash
cp .env.example .env
# set APP_SECRET
docker compose up -d --build
```

Mail data and accounts live in the `open-simple-mail-data` volume.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `APP_SECRET` | dev fallback | **Required in production**, 24+ chars. Derives the credential encryption key |
| `PORT` | `4000` | HTTP port |
| `HOST` | `0.0.0.0` | Listen address |
| `DATABASE_PATH` | `data/open-simple-mail.db` | SQLite file |
| `WEB_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed browser origins, comma separated |
| `DEMO_ENABLED` | `true` | Show the demo login button |
| `MAX_ATTACHMENT_MB` | `25` | Total outgoing attachment limit |
| `SESSION_DAYS` | `30` | Session lifetime |
| `COOKIE_SECURE` | `false` | Set to `true` behind HTTPS |
| `TRUST_PROXY` | `0` | Number of reverse-proxy hops to trust (`1` behind Nginx/Caddy) |
| `WEB_DIST` | auto | Custom web build directory |

Most providers require an app-specific password (Gmail, iCloud, Yahoo) or an authorization code (QQ, 163/126). OpenSimpleMail uses standard IMAP/SMTP, so no OAuth app review is needed.

## Security

- Passwords are hashed with scrypt; session tokens are stored as SHA-256 digests in HttpOnly, SameSite=Lax cookies.
- Mailbox passwords are encrypted with AES-256-GCM and never returned by the API.
- Email HTML is sanitized server-side and rendered inside a sandboxed iframe with `default-src 'none'`.
- Remote images are blocked until the reader explicitly opts in.
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
