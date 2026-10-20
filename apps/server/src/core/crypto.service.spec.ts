import { describe, expect, it } from 'vitest'
import type { AppConfig } from '../config/app.config'
import { CryptoService } from './crypto.service'

const config = {
  appSecret: 'unit-test-secret-with-more-than-24-characters',
} as unknown as AppConfig

describe('CryptoService', () => {
  const crypto = new CryptoService(config)

  it('hashes and verifies passwords', async () => {
    const hash = await crypto.hashPassword('correct horse battery staple')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(hash).not.toContain('correct horse')
    await expect(crypto.verifyPassword('correct horse battery staple', hash)).resolves.toBe(true)
    await expect(crypto.verifyPassword('wrong password', hash)).resolves.toBe(false)
  })

  it('uses a random salt per hash', async () => {
    const first = await crypto.hashPassword('same password')
    const second = await crypto.hashPassword('same password')
    expect(first).not.toBe(second)
  })

  it('encrypts and decrypts mailbox credentials', () => {
    const secret = 'app-specific-password-123'
    const payload = crypto.encryptSecret(secret)
    expect(payload.startsWith('v1.')).toBe(true)
    expect(payload).not.toContain(secret)
    expect(crypto.decryptSecret(payload)).toBe(secret)
  })

  it('rejects tampered ciphertext', () => {
    const payload = crypto.encryptSecret('secret')
    const parts = payload.split('.')
    const data = parts[3] as string
    parts[3] = `${data.slice(0, -2)}aa`
    expect(() => crypto.decryptSecret(parts.join('.'))).toThrow()
  })

  it('produces url-safe random tokens and stable hashes', () => {
    const token = crypto.randomToken(24)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(crypto.sha256('abc')).toBe(crypto.sha256('abc'))
    expect(crypto.sha256('abc')).not.toBe(crypto.sha256('abd'))
  })
})
