import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { ImapFlow } from 'imapflow'
import type { MailCredentials } from './mail.types'

interface PoolEntry {
  client: ImapFlow
  ready: Promise<void>
  queue: Promise<unknown>
  pending: number
  lastUsed: number
  idleTimer?: NodeJS.Timeout
}

const IDLE_CLOSE_MS = 5 * 60 * 1000

function createClient(creds: MailCredentials, verifyOnly = false): ImapFlow {
  return new ImapFlow({
    host: creds.imap.host,
    port: creds.imap.port,
    secure: creds.imap.secure,
    auth: { user: creds.username, pass: creds.password },
    logger: false,
    clientInfo: { name: 'OpenSimpleMail', version: '0.1.0', vendor: 'OpenSimpleMail' },
    disableAutoIdle: true,
    verifyOnly,
    connectionTimeout: 20_000,
    greetingTimeout: 12_000,
    socketTimeout: 90_000,
    tls: { servername: creds.imap.host },
  })
}

/**
 * One serialized IMAP connection per account. IMAP has a single selected mailbox
 * per connection, so concurrent commands would otherwise race each other.
 */
@Injectable()
export class ImapPool implements OnModuleDestroy {
  private readonly logger = new Logger(ImapPool.name)
  private readonly entries = new Map<string, PoolEntry>()

  async withClient<T>(creds: MailCredentials, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const entry = this.getEntry(creds)
    entry.pending += 1

    const run = entry.queue.then(async () => {
      await entry.ready
      entry.lastUsed = Date.now()
      return fn(entry.client)
    })
    entry.queue = run.then(
      () => undefined,
      () => undefined,
    )

    try {
      return await run
    } catch (error) {
      if (!entry.client.usable) this.drop(creds.accountId, entry)
      throw error
    } finally {
      entry.pending -= 1
      entry.lastUsed = Date.now()
      this.scheduleIdleClose(creds.accountId, entry)
    }
  }

  /** Opens a throwaway connection, which keeps credential checks out of the pool. */
  async verify(creds: MailCredentials): Promise<void> {
    const client = createClient(creds, true)
    try {
      await client.connect()
    } finally {
      await client.logout().catch(() => undefined)
    }
  }

  invalidate(accountId: string): void {
    const entry = this.entries.get(accountId)
    if (entry) this.drop(accountId, entry)
  }

  onModuleDestroy(): void {
    for (const [accountId, entry] of this.entries) {
      this.drop(accountId, entry)
    }
  }

  private getEntry(creds: MailCredentials): PoolEntry {
    const existing = this.entries.get(creds.accountId)
    if (existing?.client.usable) return existing
    if (existing) this.drop(creds.accountId, existing)

    const client = createClient(creds)
    const entry: PoolEntry = {
      client,
      ready: client.connect(),
      queue: Promise.resolve(),
      pending: 0,
      lastUsed: Date.now(),
    }
    // Avoid unhandled rejections: consumers await `ready` through the queue.
    entry.ready.catch(() => undefined)
    this.entries.set(creds.accountId, entry)
    return entry
  }

  private scheduleIdleClose(accountId: string, entry: PoolEntry): void {
    if (entry.idleTimer) clearTimeout(entry.idleTimer)
    entry.idleTimer = setTimeout(() => {
      if (entry.pending > 0) return
      if (Date.now() - entry.lastUsed < IDLE_CLOSE_MS) return
      this.drop(accountId, entry)
    }, IDLE_CLOSE_MS)
    entry.idleTimer.unref?.()
  }

  private drop(accountId: string, entry: PoolEntry): void {
    if (this.entries.get(accountId) === entry) this.entries.delete(accountId)
    if (entry.idleTimer) clearTimeout(entry.idleTimer)
    entry.client.logout().catch((error: unknown) => {
      this.logger.debug(`Closing IMAP connection for ${accountId} failed: ${String(error)}`)
    })
  }
}
