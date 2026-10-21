import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  type ScryptOptions,
  scrypt as scryptCallback,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { APP_CONFIG, type AppConfig } from '../config/app.config'

const KEY_LENGTH = 32
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

/**
 * Password hashing (scrypt) and reversible encryption for mailbox credentials
 * (AES-256-GCM). The encryption key is derived from APP_SECRET, so rotating the
 * secret invalidates stored mailbox passwords by design.
 */
@Injectable()
export class CryptoService {
  private readonly encryptionKey: Buffer

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.encryptionKey = scryptSync(config.appSecret, 'osm/credential-key/v1', KEY_LENGTH, {
      ...SCRYPT_PARAMS,
    })
  }

  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16)
    const derived = await scrypt(password, salt, 64, SCRYPT_PARAMS)
    return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString(
      'base64url',
    )}$${derived.toString('base64url')}`
  }

  async verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false
    const [, n, r, p, saltPart, hashPart] = parts
    const salt = Buffer.from(saltPart as string, 'base64url')
    const expected = Buffer.from(hashPart as string, 'base64url')
    const derived = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT_PARAMS.maxmem,
    })
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  }

  encryptSecret(plain: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv)
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString(
      'base64url',
    )}`
  }

  decryptSecret(payload: string): string {
    const [version, ivPart, tagPart, dataPart] = payload.split('.')
    if (version !== 'v1' || !ivPart || !tagPart || !dataPart) {
      throw new Error('Unsupported credential payload')
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivPart, 'base64url'),
    )
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url')
  }

  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }

  /** Constant-time string comparison, used for the emergency recovery password. */
  safeCompare(left: string, right: string): boolean {
    const leftHash = createHash('sha256').update(left).digest()
    const rightHash = createHash('sha256').update(right).digest()
    return timingSafeEqual(leftHash, rightHash)
  }
}
