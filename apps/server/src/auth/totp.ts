import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Minimal RFC 6238 TOTP (SHA-1, 6 digits, 30 second step) plus the base32
 * helpers an authenticator app expects. Kept dependency-free so the server
 * does not pull a crypto wrapper for ~60 lines of HMAC.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export const TOTP_STEP_SECONDS = 30
export const TOTP_DIGITS = 6
/** Accept the previous and next step so a slightly slow phone still works. */
export const TOTP_WINDOW = 1

export function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/[\s=]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index < 0) throw new Error('Invalid base32 character')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes))
}

/** HOTP for an arbitrary counter; the building block of TOTP. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', secret).update(message).digest()
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0)
  return String(binary % 10 ** digits).padStart(digits, '0')
}

export function totpStep(atMs = Date.now()): number {
  return Math.floor(atMs / 1000 / TOTP_STEP_SECONDS)
}

export function totpCode(secretBase32: string, atMs = Date.now()): string {
  return hotp(base32Decode(secretBase32), totpStep(atMs))
}

/**
 * Verify a code and return the time step it matched, or null. The step is used
 * to reject replays: a code accepted once cannot be accepted again.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  atMs = Date.now(),
  window = TOTP_WINDOW,
): number | null {
  const normalized = code.replace(/\s+/g, '')
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(normalized)) return null
  let secret: Buffer
  try {
    secret = base32Decode(secretBase32)
  } catch {
    return null
  }
  const current = totpStep(atMs)
  const expected = Buffer.from(normalized)
  for (let offset = -window; offset <= window; offset += 1) {
    const step = current + offset
    const candidate = Buffer.from(hotp(secret, step))
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return step
  }
  return null
}

export function otpauthUri(
  secret: string,
  accountEmail: string,
  issuer = 'OpenSimpleMail',
): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

/** One-time recovery codes, grouped for readability: abcd-efgh. */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString('hex') // 10 hex characters
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s-]/g, '')
}
