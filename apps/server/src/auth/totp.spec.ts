import { describe, expect, it } from 'vitest'
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  hotp,
  normalizeRecoveryCode,
  otpauthUri,
  totpCode,
  verifyTotp,
} from './totp'

// RFC 6238 appendix B uses this ASCII secret for its SHA-1 vectors.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const original = Buffer.from('OpenSimpleMail TOTP secret', 'utf8')
    expect(base32Decode(base32Encode(original)).equals(original)).toBe(true)
  })

  it('ignores padding and whitespace', () => {
    expect(base32Decode(' gezd gnbv ').toString('ascii')).toBe('12345')
  })
})

describe('hotp', () => {
  it('matches the RFC 4226 test vectors', () => {
    const secret = Buffer.from('12345678901234567890')
    expect(hotp(secret, 0)).toBe('755224')
    expect(hotp(secret, 1)).toBe('287082')
    expect(hotp(secret, 8)).toBe('399871')
  })
})

describe('totp', () => {
  it('matches the RFC 6238 SHA-1 vectors', () => {
    const cases: Array<[number, string]> = [
      [59_000, '287082'],
      [1_111_111_109_000, '081804'],
      [1_111_111_111_000, '050471'],
      [1_234_567_890_000, '005924'],
      [2_000_000_000_000, '279037'],
    ]
    for (const [at, expected] of cases) {
      expect(totpCode(RFC_SECRET, at)).toBe(expected)
    }
  })

  it('accepts the current step and its neighbours only', () => {
    const at = 1_700_000_000_000
    const current = verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, at), at)
    expect(current).not.toBeNull()

    const previous = totpCode(RFC_SECRET, at - 30_000)
    expect(verifyTotp(RFC_SECRET, previous, at)).not.toBeNull()

    const far = totpCode(RFC_SECRET, at - 300_000)
    expect(verifyTotp(RFC_SECRET, far, at)).toBeNull()
  })

  it('rejects malformed codes', () => {
    expect(verifyTotp(RFC_SECRET, '12345')).toBeNull()
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBeNull()
    expect(verifyTotp(RFC_SECRET, '')).toBeNull()
  })

  it('builds an otpauth URI an authenticator can read', () => {
    const uri = otpauthUri(RFC_SECRET, 'yin@example.com')
    expect(uri.startsWith('otpauth://totp/OpenSimpleMail%3Ayin%40example.com?')).toBe(true)
    expect(uri).toContain(`secret=${RFC_SECRET}`)
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
  })
})

describe('recovery codes', () => {
  it('generates unique grouped codes', () => {
    const codes = generateRecoveryCodes(8)
    expect(codes).toHaveLength(8)
    expect(new Set(codes).size).toBe(8)
    for (const code of codes) expect(code).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/)
  })

  it('normalizes what a user types', () => {
    expect(normalizeRecoveryCode(' ABCDE - F0123 ')).toBe('abcdef0123')
  })
})
