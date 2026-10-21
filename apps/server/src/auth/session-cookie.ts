import type { Response } from 'express'
import type { AppConfig } from '../config/app.config'
import { SESSION_COOKIE, type SessionResult } from './auth.service'

export function sessionCookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
    path: '/',
  }
}

export function attachSessionCookie(
  res: Response,
  session: SessionResult,
  config: AppConfig,
): void {
  res.cookie(SESSION_COOKIE, session.token, {
    ...sessionCookieOptions(config),
    maxAge: session.maxAgeMs,
  })
}
