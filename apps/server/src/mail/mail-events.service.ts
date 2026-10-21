import { Injectable, Logger, type MessageEvent, type OnModuleDestroy } from '@nestjs/common'
import type { ImapFlow } from 'imapflow'
import { Observable, Subject } from 'rxjs'
import { AccountsService } from '../accounts/accounts.service'
import { createImapClient } from './imap-client'
import { MailService } from './mail.service'

/** How long to wait before rebuilding a watcher the server dropped. */
const RECONNECT_DELAY_MS = 30_000
/** Comment-only frames keep proxies from closing an otherwise silent stream. */
const HEARTBEAT_MS = 25_000

export interface NewMailEvent {
  accountId: string
  at: string
}

interface AccountWatcher {
  client: ImapFlow
  stopped: boolean
  retry?: NodeJS.Timeout
}

interface Listener {
  subject: Subject<NewMailEvent>
  count: number
}

/**
 * Pushes new mail to open tabs instead of letting them poll for it.
 *
 * An IMAP connection per account sits in IDLE on INBOX. When the server reports
 * EXISTS, the caches that would answer the next request are dropped and every
 * subscribed browser is told to refetch, which brings the delay down from one
 * poll interval to roughly the round-trip.
 *
 * Watchers only exist while a tab is listening: they cost a connection each, and
 * a closed browser should not keep the mailbox open.
 */
@Injectable()
export class MailEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(MailEventsService.name)
  private readonly listeners = new Map<string, Listener>()
  private readonly watchers = new Map<string, AccountWatcher>()
  private destroyed = false

  constructor(
    private readonly accounts: AccountsService,
    private readonly mail: MailService,
  ) {}

  /** One SSE subscriber's view of the events for a user. */
  stream(userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const listener = this.listenerFor(userId)
      const subscription = listener.subject.subscribe((event) => {
        subscriber.next({ type: 'mail', data: JSON.stringify(event) })
      })
      listener.count += 1
      void this.watchUser(userId)

      const heartbeat = setInterval(() => {
        subscriber.next({ type: 'ping', data: String(Date.now()) })
      }, HEARTBEAT_MS)
      heartbeat.unref?.()

      return () => {
        clearInterval(heartbeat)
        subscription.unsubscribe()
        this.release(userId)
      }
    })
  }

  onModuleDestroy(): void {
    this.destroyed = true
    for (const accountId of [...this.watchers.keys()]) this.stopWatcher(accountId)
  }

  private listenerFor(userId: string): Listener {
    const existing = this.listeners.get(userId)
    if (existing) return existing
    const listener: Listener = { subject: new Subject<NewMailEvent>(), count: 0 }
    this.listeners.set(userId, listener)
    return listener
  }

  private release(userId: string): void {
    const listener = this.listeners.get(userId)
    if (!listener) return
    listener.count -= 1
    if (listener.count > 0) return
    this.listeners.delete(userId)
    listener.subject.complete()
    for (const account of this.accountsFor(userId)) this.stopWatcher(account.id)
  }

  private accountsFor(userId: string) {
    try {
      return this.accounts.list(userId)
    } catch (error) {
      this.logger.warn(`Cannot list accounts for ${userId}: ${String(error)}`)
      return []
    }
  }

  private async watchUser(userId: string): Promise<void> {
    if (this.destroyed) return
    for (const account of this.accountsFor(userId)) {
      if (account.kind === 'demo') continue
      if (this.watchers.has(account.id)) continue
      await this.startWatcher(userId, account.id)
    }
  }

  private async startWatcher(userId: string, accountId: string): Promise<void> {
    if (this.destroyed) return
    let row: ReturnType<AccountsService['getRow']>
    try {
      row = this.accounts.getRow(userId, accountId)
    } catch {
      return
    }
    if (row.kind === 'demo') return

    const creds = this.accounts.credentialsFor(row)
    const client = createImapClient(creds, { autoIdle: true })
    const watcher: AccountWatcher = { client, stopped: false }
    this.watchers.set(accountId, watcher)

    client.on('error', (error: Error) => {
      this.logger.warn(`IMAP watcher for ${creds.email} failed: ${error.message}`)
      this.restart(userId, accountId, watcher)
    })
    client.on('close', () => this.restart(userId, accountId, watcher))

    try {
      await client.connect()
      await client.mailboxOpen('INBOX', { readOnly: true })
    } catch (error) {
      this.logger.warn(`Cannot watch INBOX of ${creds.email}: ${String(error)}`)
      this.restart(userId, accountId, watcher)
      return
    }

    if (watcher.stopped) {
      void client.logout().catch(() => undefined)
      return
    }
    // Attached after the SELECT: opening a mailbox also emits `exists`, and that
    // one is not news.
    client.on('exists', () => this.notify(userId, accountId))
    this.logger.log(`Watching INBOX of ${creds.email} for new mail`)
  }

  private notify(userId: string, accountId: string): void {
    this.mail.invalidateAccount(accountId)
    this.listeners.get(userId)?.subject.next({ accountId, at: new Date().toISOString() })
  }

  private restart(userId: string, accountId: string, watcher: AccountWatcher): void {
    if (watcher.stopped) return
    watcher.stopped = true
    if (this.watchers.get(accountId) === watcher) this.watchers.delete(accountId)
    if (watcher.retry) clearTimeout(watcher.retry)
    void watcher.client.logout().catch(() => undefined)

    if (this.destroyed || !this.listeners.has(userId)) return
    watcher.retry = setTimeout(() => {
      if (!this.listeners.has(userId)) return
      void this.startWatcher(userId, accountId)
    }, RECONNECT_DELAY_MS)
    watcher.retry.unref?.()
  }

  private stopWatcher(accountId: string): void {
    const watcher = this.watchers.get(accountId)
    if (!watcher) return
    watcher.stopped = true
    this.watchers.delete(accountId)
    if (watcher.retry) clearTimeout(watcher.retry)
    void watcher.client.logout().catch(() => undefined)
  }
}
