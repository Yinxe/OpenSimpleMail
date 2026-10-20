import { resolve } from 'node:path'

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
  cookieSecure: boolean
  /** Number of reverse-proxy hops to trust for req.ip / req.protocol. 0 disables. */
  trustProxy: number
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
  const webOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return {
    nodeEnv,
    isProduction,
    port,
    host: process.env.HOST ?? '0.0.0.0',
    appSecret,
    databasePath: resolve(process.env.DATABASE_PATH ?? 'data/open-simple-mail.db'),
    webOrigins,
    sessionDays: int(process.env.SESSION_DAYS, 30),
    demoEnabled: bool(process.env.DEMO_ENABLED, true),
    maxAttachmentMb: int(process.env.MAX_ATTACHMENT_MB, 25),
    cookieSecure: bool(process.env.COOKIE_SECURE, false),
    trustProxy: int(process.env.TRUST_PROXY, 0),
    webDist: process.env.WEB_DIST ? resolve(process.env.WEB_DIST) : null,
    version: process.env.APP_VERSION ?? '0.1.0',
  }
}
