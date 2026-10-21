import { dirname, isAbsolute, join, resolve } from 'node:path'

// apps/server/src/config and apps/server/dist/config are both four levels below
// the repository root, so this works in dev, tests and the Docker image.
const PROJECT_ROOT = resolve(__dirname, '../../../..')

export interface AppConfig {
  nodeEnv: string
  isProduction: boolean
  port: number
  host: string
  appSecret: string
  databasePath: string
  /** Origins allowed to call the API with credentials (browser Origin header). */
  webOrigins: string[]
  sessionDays: number
  demoEnabled: boolean
  maxAttachmentMb: number
  /**
   * Scratch directory for outgoing uploads and for attachments extracted while
   * reading a message. Absolute; defaults to a sibling of the database file.
   */
  attachmentDir: string
  /** Upper bound for the on-disk attachment cache, in MB. */
  attachmentCacheMb: number
  cookieSecure: boolean
  /** Number of reverse-proxy hops to trust for req.ip / req.protocol. 0 disables. */
  trustProxy: number
  /** Optional emergency password for administrator recovery. Empty disables it. */
  adminRecoveryPassword: string
  /** Allow IMAP/SMTP hosts that resolve to private or loopback addresses. */
  allowPrivateMailHosts: boolean
  /** Hostnames that stay allowed even when private networks are blocked. */
  mailHostAllowlist: string[]
  /** clamd host for optional attachment scanning. Empty disables it. */
  clamavHost: string
  clamavPort: number
  /** Absolute path to the built React app, or null when it is not present. */
  webDist: string | null
  version: string
}

export const APP_CONFIG = 'APP_CONFIG'

const DEV_SECRET = 'open-simple-mail-development-secret-do-not-use-in-production'

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function loadAppConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development'
  const isProduction = nodeEnv === 'production'
  const appSecret = process.env.APP_SECRET?.trim() || (isProduction ? '' : DEV_SECRET)

  if (!appSecret) {
    throw new Error('APP_SECRET must be set when NODE_ENV=production')
  }
  if (appSecret.length < 24) {
    throw new Error('APP_SECRET must be at least 24 characters long')
  }

  const port = int(process.env.PORT, 4000)
  const adminRecoveryPassword = process.env.ADMIN_RECOVERY_PASSWORD?.trim() ?? ''
  if (adminRecoveryPassword && adminRecoveryPassword.length < 12) {
    throw new Error('ADMIN_RECOVERY_PASSWORD must be at least 12 characters long')
  }

  const mailHostAllowlist = (process.env.MAIL_HOST_ALLOWLIST ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)

  const webOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5174,http://127.0.0.1:5174')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  // A relative DATABASE_PATH is anchored to the repository root, never to the
  // process working directory: `npm run dev` starts with apps/server as cwd,
  // while `npm start` runs from the root, and both must open the same file.
  const databasePath = process.env.DATABASE_PATH?.trim() || 'data/open-simple-mail.db'
  const resolvedDatabasePath = isAbsolute(databasePath)
    ? databasePath
    : resolve(PROJECT_ROOT, databasePath)

  // Attachments are streamed to disk instead of being held in memory. The
  // default keeps them next to the SQLite file so the Docker volume that
  // already carries the database covers them too.
  const attachmentDir = process.env.ATTACHMENT_DIR?.trim()

  return {
    nodeEnv,
    isProduction,
    port,
    host: process.env.HOST ?? '0.0.0.0',
    appSecret,
    databasePath: resolvedDatabasePath,
    webOrigins,
    sessionDays: int(process.env.SESSION_DAYS, 30),
    demoEnabled: bool(process.env.DEMO_ENABLED, true),
    maxAttachmentMb: int(process.env.MAX_ATTACHMENT_MB, 25),
    attachmentDir: attachmentDir
      ? isAbsolute(attachmentDir)
        ? attachmentDir
        : resolve(PROJECT_ROOT, attachmentDir)
      : join(dirname(resolvedDatabasePath), 'attachments'),
    attachmentCacheMb: int(process.env.ATTACHMENT_CACHE_MB, 256),
    cookieSecure: bool(process.env.COOKIE_SECURE, false),
    trustProxy: int(process.env.TRUST_PROXY, 0),
    adminRecoveryPassword,
    allowPrivateMailHosts: bool(process.env.ALLOW_PRIVATE_MAIL_HOSTS, false),
    mailHostAllowlist,
    clamavHost: process.env.CLAMAV_HOST?.trim() ?? '',
    clamavPort: int(process.env.CLAMAV_PORT, 3310),
    webDist: process.env.WEB_DIST ? resolve(process.env.WEB_DIST) : null,
    version: process.env.APP_VERSION ?? '0.1.0',
  }
}
