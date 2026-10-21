# Changelog

All notable changes to OpenSimpleMail are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/), and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Listen for `ImapFlow` connection-level `error` events, so an idle socket timeout or dropped IMAP connection no longer terminates the Node process.
- Retry a failed IMAP operation once on a fresh connection, and use portable `LIST` + `STATUS` folder counting for providers such as QQ Mail that close the connection on `LIST-STATUS`.
- Raise the IMAP socket timeout above the pool idle-close interval to avoid tearing down healthy idle connections.

### Added

- First-run setup wizard: creates the initial administrator and stores site name, public-registration and demo-mode policy.
- Administrator role (`users.is_admin`), admin-only system settings API and UI.
- Public registration switch enforced server-side; the login/register pages reflect the closed state.
- Setup guard: application APIs return 412 until the system is initialized; health, public config and `/api/setup` remain reachable.
- Automatic upgrade path: existing installations promote the oldest user to administrator and keep registration open.

### Security

- Demo login and registration are blocked before setup completes.
- Non-admin users cannot read or change system settings.
- Optional `ADMIN_RECOVERY_PASSWORD` emergency recovery: admin-only, constant-time comparison, rate limited, rotates the password and invalidates all sessions for the account.

## [0.1.0] - 2026-10-21

### Added

- React 19 + Vite web client with a responsive three-pane mailbox layout, light/dark themes, keyboard shortcuts and mobile navigation.
- NestJS 12 API with SQLite storage, scrypt password hashing and HttpOnly session cookies.
- Multiple IMAP/SMTP accounts: add, edit, delete, connection test and provider presets (Gmail, Outlook, QQ, 163/126, iCloud, Yahoo, custom).
- Unified inbox, folder tree with unread counts, paginated message list, search, read/unread, star, archive and delete.
- Message reader with sanitized HTML in a sandboxed iframe, strict CSP, remote-image blocking and attachment downloads.
- Rich-text composer with CC/BCC, attachments, reply/forward quoting and automatic copy to the Sent folder.
- AES-256-GCM encryption for stored mailbox credentials.
- Built-in demo workspace with seeded emails, persisted in SQLite.
- Biome configuration (lint, format, import sorting), Vitest unit tests and black-box HTTP end-to-end tests.
- Dockerfile, docker-compose, GitHub Actions CI, README (中文/English), SECURITY and CONTRIBUTING guides.

### Security

- Origin validation for state-changing requests, per-IP rate limits on authentication endpoints.
- Server-side HTML sanitization with `sanitize-html`; scripts, event handlers and dangerous URLs are removed.
- `helmet` security headers, `nosniff` on attachment downloads and `Content-Disposition: attachment`.
