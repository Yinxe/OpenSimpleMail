import { describe, expect, it } from 'vitest'
import { ImapPool } from './imap.pool'
import type { MailCredentials } from './mail.types'

const creds: MailCredentials = {
  accountId: 'pool-spec',
  name: 'Pool Spec',
  email: 'pool@example.com',
  username: 'pool@example.com',
  password: 'secret',
  imap: { host: '127.0.0.1', port: 1, secure: false },
  smtp: { host: '127.0.0.1', port: 1, secure: false },
}

describe('ImapPool', () => {
  it('turns an ImapFlow socket error into a dropped connection instead of a crash', async () => {
    const pool = new ImapPool()
    const internals = pool as unknown as {
      getEntry: (value: MailCredentials) => {
        client: { emit: (event: string, error: Error) => boolean }
      }
      entries: Map<string, unknown>
    }

    const entry = internals.getEntry(creds)
    expect(() => entry.client.emit('error', new Error('Socket timeout'))).not.toThrow()
    expect(internals.entries.size).toBe(0)

    await pool.onModuleDestroy()
  })
})
