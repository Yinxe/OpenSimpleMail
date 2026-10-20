# Security Policy

## Supported versions

The `main` branch and the latest `0.1.x` release receive security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for a suspected vulnerability.

Use GitHub's private **Security → Report a vulnerability** flow on the repository (Security Advisories), or contact the maintainers through the address listed on the repository profile. Include:

- affected version / commit
- reproduction steps or a proof of concept
- impact assessment
- any suggested fix

We aim to acknowledge reports within 72 hours and to publish a coordinated fix. Please give us reasonable time before public disclosure.

## Threat model

OpenSimpleMail is designed for **single-tenant, self-hosted** use: one person (or one trusted household/team) runs the server and owns all mailboxes connected to it.

What the application protects against:

- **Credential theft at rest**: mailbox passwords are encrypted with AES-256-GCM using a key derived from `APP_SECRET`. The API never returns them.
- **Session theft**: session tokens are random 256-bit values stored only as SHA-256 digests; cookies are `HttpOnly` and `SameSite=Lax`.
- **XSS from email content**: HTML is sanitized server-side (scripts, event handlers and dangerous URLs removed) and rendered inside a sandboxed iframe with `default-src 'none'`. Scripts cannot run even if a sanitizer bypass exists.
- **Tracking pixels**: remote images are blocked by CSP until the reader clicks “Show images”.
- **CSRF**: state-changing requests must come from an allowed `Origin`; cookies are `SameSite=Lax`.
- **Brute force**: auth endpoints are rate limited (per IP), passwords are hashed with scrypt.
- **Header injection**: attachment filenames and generated headers are sanitized.

What it does **not** protect against:

- **A compromised server or `APP_SECRET`**. Anyone with both the database and the secret can decrypt mailbox credentials.
- **Untrusted multi-tenant use**. Any authenticated user can ask the server to connect to an arbitrary IMAP/SMTP host and port. This is inherent to a bring-your-own-mailbox client and creates an SSRF surface. Do not offer public sign-ups.
- **Malicious attachments**. Files are downloaded as-is; they are never executed by the server, but your desktop may still open them.
- **Phishing / spoofed senders**. The UI displays the headers the mail server provides; it does not verify DKIM or DMARC.
- **Email content confidentiality on the mail server**. IMAP/SMTP TLS protects transport, but messages still live on your provider's servers.

## Hardening checklist

1. Set a long random `APP_SECRET` (for example `openssl rand -base64 48`) and keep it out of version control.
2. Serve the app over HTTPS (reverse proxy such as Caddy, Nginx or Traefik) and set `COOKIE_SECURE=true`.
3. Keep `DEMO_ENABLED=false` on a public instance.
4. Restrict access at the network layer (VPN, Tailscale, basic auth at the proxy) if the instance is internet-facing.
5. Back up the SQLite database and the secret together; losing the secret makes stored mailbox passwords unrecoverable.
6. Keep Node.js and npm dependencies up to date; run `npm audit` periodically.
7. Do not run the container as root — the provided image uses the `node` user.

## Known limitations

- No OAuth 2.0 yet; providers that disable app passwords cannot be used.
- No two-factor authentication for the local account.
- Messages are fetched live from IMAP; there is no offline cache yet.
- Attachments are buffered in memory (bounded by `MAX_ATTACHMENT_MB`) rather than streamed.
- The demo workspace is isolated per user, but it is still a demo: do not put real mail there.
