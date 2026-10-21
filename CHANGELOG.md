# Changelog

All notable changes to OpenSimpleMail are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/), and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Administrator "attachment cache" panel under Settings: it shows how many messages are extracted, the disk usage against the configured budget, and a confirmed "clear cache" action (`GET` / `DELETE /api/admin/attachments`) that drops every extracted attachment without touching mail on the server. Parses already in flight are not written back into the cleared cache.

### Changed

- Stream attachments through disk instead of the heap: outgoing uploads are written to `data/attachments/upload/` and read back by the MIME composer, while incoming messages are parsed from the IMAP stream with each attachment extracted to `data/attachments/cache/`. A 25 MB send or a 40 MB message no longer holds tens of megabytes in memory.
- Replace the in-memory parsed-message cache with one that keeps only the text body and attachment metadata, backed by a disk cache bounded by `ATTACHMENT_CACHE_MB` (default 256 MB), evicted least-recently-used and swept on startup.
- Report the real attachment size in the reader (it used to be missing for IMAP accounts), and inline `cid:` images from the disk cache under a 12 MB total budget.

### Fixed

- Keep a strong active style on the opened message row, including in the starred view, by matching the message's real folder and using an accent bar instead of a subtle tint.
- Cache folder counts for 45 seconds and pipeline STATUS requests, so sidebar refresh no longer performs one sequential round-trip per folder.
- Show an explicit error state with retry in the message list instead of rendering an IMAP failure as "no messages".
- Cache parsed messages briefly, so reopening a message or downloading several attachments does not download and parse the same source again.
- Listen for `ImapFlow` connection-level `error` events, so an idle socket timeout or dropped IMAP connection no longer terminates the Node process.
- Retry a failed IMAP operation once on a fresh connection, and use portable `LIST` + `STATUS` folder counting for providers such as QQ Mail that close the connection on `LIST-STATUS`.
- Raise the IMAP socket timeout above the pool idle-close interval to avoid tearing down healthy idle connections.
- Pre-bundle the CommonJS `@osm/shared` workspace package for Vite, so its named exports resolve in development again.
- Preserve the original letter case of alphanumeric verification codes (`090b51` no longer becomes `090B51`), and prefer the body's casing when the subject disagrees.
- Reject recipient names and usernames in the salutation instead of treating them as codes; candidates are now scored by keyword proximity, numeric format, isolated line, repetition and negative context.
- Recognise "15 分钟后失效" expiry phrasing and show a case-sensitivity hint for codes that contain letters.

### Added

- Folder management from the sidebar: create, rename and delete custom folders, and empty the trash; backed by IMAP `CREATE`/`RENAME`/`DELETE`/`CLOSE` and the demo store.
- Message-list previews for real IMAP accounts: the list fetch now includes the first 4 KB of each message, and a lightweight parser extracts the first text part (quoted-printable, base64, multipart or HTML) into a 180-character summary.
- Unified inbox pagination: `/api/messages/unified` merges each account's INBOX (or starred view) page by page, returns a true total and makes the pager work in the unified view.
- Touch gestures on the message list: swipe left to archive (or delete when no archive folder exists), swipe right to toggle the star, and pull down at the top to refresh.
- Expanded keyboard shortcuts (forward, star, read/unread, archive, delete, select, `g i`) and a `?` help overlay, also reachable from a keyboard button in the list header.
- Unread badges: title count and dynamic favicon; optional desktop notifications for new mail while the tab is in the background, with a Settings toggle and permission request.
- Batch selection in the message list: per-row checkboxes with Shift range, select-all, and bulk mark read/unread, archive and delete; the server applies each batch with one IMAP command.
- Undo send: the composer waits five seconds before delivering, shows a countdown on the send button and footer, and offers a cancel action both in the footer and in the toast.
- Read-state controls in the message list: a clear unread dot / read check marker, a per-row read/unread toggle, and a one-click "mark all read" action for the current folder or unified inbox.
- Recipient autocomplete in the composer: addresses are learned from sent mail and opened messages, suggestions follow the token after the last comma/semicolon, and can be picked with the mouse or arrow keys + Enter.
- Reader rendering modes: full HTML, simplified text (images and styling removed, paragraphs/lists/links kept) and a verification-code view; the choice is remembered per browser.
- Verification-code extraction from the message subject, text part and rendered HTML, with one-click copy, expiry hints, alternative candidates and a fallback to the original message when nothing is found.
- Two seeded verification-code emails in the demo workspace (one numeric, one lowercase alphanumeric), so the new reader mode and case handling can be tried without a real mailbox.
- Per-account plain-text signature, editable in the account dialog and inserted below the caret for new mail or above the quote for replies and forwards.
- Starred view (收藏): a virtual mailbox that aggregates `\Flagged` messages across folders, uses the provider's own `\Flagged` folder when it exists, keeps search scoped to flagged mail, and returns each message's real folder so open/star/delete work from the merged list.
- Sidebar starred entry with a count when the provider exposes a `\Flagged` folder.
- Delete confirmation dialog showing subject, sender and destination, with a session-only "keep asking" checkbox and a matching session switch under Settings.
- Reply all, with an `a` shortcut in the reader, deduplicating recipients and excluding the account's own addresses.
- Local draft autosave and restore in the composer, with a discard action and a before-unload warning; attachments are explicitly not persisted.
- Per-user preferences persisted in SQLite: refresh interval, page size, default view, list density, auto-mark-read and remote-image policy, editable under Settings.
- Auto-refresh status hint in the mail list; compact density and configurable unified-inbox default.
- First-run setup wizard: creates the initial administrator and stores site name, public-registration and demo-mode policy.
- Administrator role (`users.is_admin`), admin-only system settings API and UI.
- Public registration switch enforced server-side; the login/register pages reflect the closed state.
- Setup guard: application APIs return 412 until the system is initialized; health, public config and `/api/setup` remain reachable.
- Automatic upgrade path: existing installations promote the oldest user to administrator and keep registration open.

### Changed

- Starring is now labelled 收藏/取消收藏 and points at the sidebar view; un-starring inside the starred view removes the row immediately.
- Deleting a message removes its row optimistically and reports whether it went to the trash or was deleted permanently.
- Dev ports moved to API `4010` and Vite `5174` (`PORT` / `WEB_PORT` in `.env`); Vite reads the same `.env` for its proxy and fails loudly when the web port is taken. Docker still pins the container to `4000`.
- Relative `DATABASE_PATH` values are anchored to the repository root instead of the process working directory, so `npm run dev` (cwd `apps/server`) and `npm start` (cwd root) now open the same SQLite file. Previously dev silently used `apps/server/data` and hid accounts created by the root-level server.

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
