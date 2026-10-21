import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import type { AccountRow } from '../accounts/account.types'
import { DatabaseService } from '../core/database.service'
import {
  createDemoStore,
  DEMO_ACCOUNT_EMAIL,
  DEMO_ACCOUNT_NAME,
  DEMO_FOLDERS,
  type DemoStore,
} from './demo.fixtures'
import { DemoProvider } from './demo.provider'

@Injectable()
export class DemoService {
  private readonly stores = new Map<string, DemoStore>()

  constructor(private readonly db: DatabaseService) {}

  /** Creates the demo account row on first use and returns it. */
  ensureAccount(userId: string): AccountRow {
    const existing = this.db.db
      .prepare("SELECT * FROM accounts WHERE user_id = ? AND kind = 'demo' LIMIT 1")
      .get(userId) as AccountRow | undefined
    if (existing) return existing

    const now = new Date().toISOString()
    const row: AccountRow = {
      id: randomUUID(),
      user_id: userId,
      kind: 'demo',
      name: DEMO_ACCOUNT_NAME,
      email: DEMO_ACCOUNT_EMAIL,
      username: DEMO_ACCOUNT_EMAIL,
      secret: '',
      imap_host: '',
      imap_port: 993,
      imap_secure: 1,
      smtp_host: '',
      smtp_port: 465,
      smtp_secure: 1,
      color: '#b45309',
      signature: '',
      created_at: now,
      updated_at: now,
    }
    this.db.db
      .prepare(
        `INSERT INTO accounts (
          id, user_id, kind, name, email, username, secret,
          imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure,
          color, signature, created_at, updated_at
        ) VALUES (
          @id, @user_id, @kind, @name, @email, @username, @secret,
          @imap_host, @imap_port, @imap_secure, @smtp_host, @smtp_port, @smtp_secure,
          @color, @signature, @created_at, @updated_at
        )`,
      )
      .run(row)
    this.stores.set(userId, createDemoStore())
    this.persist(userId)
    return row
  }

  getStore(userId: string): DemoStore {
    const cached = this.stores.get(userId)
    if (cached) return cached

    const row = this.db.db
      .prepare('SELECT payload FROM demo_state WHERE user_id = ?')
      .get(userId) as { payload: string } | undefined
    const store = row ? (JSON.parse(row.payload) as DemoStore) : createDemoStore()
    // Stores created before folder management shipped do not have this field.
    if (!Array.isArray(store.folders)) {
      store.folders = DEMO_FOLDERS.map((folder) => ({ ...folder }))
    }
    this.stores.set(userId, store)
    return store
  }

  persist(userId: string): void {
    const store = this.stores.get(userId)
    if (!store) return
    this.db.db
      .prepare(
        `INSERT INTO demo_state (user_id, payload, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(store), new Date().toISOString())
  }

  providerFor(account: AccountRow): DemoProvider {
    return new DemoProvider(this, account)
  }
}
