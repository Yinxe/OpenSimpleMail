import { Injectable } from '@nestjs/common'
import type { ContactDto } from '@osm/shared'
import { DatabaseService } from '../core/database.service'

interface ContactAddress {
  name?: string | null
  address: string
}

const MAX_CONTACTS_PER_USER = 500
const DEFAULT_LIMIT = 8

@Injectable()
export class ContactsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Upserts addresses seen in sent or opened mail. Names are only overwritten
   * when the new entry actually carries one, so a bare address never erases a
   * previously learned display name.
   */
  record(userId: string, addresses: ContactAddress[]): void {
    if (addresses.length === 0) return
    const now = new Date().toISOString()
    const seen = new Set<string>()
    const upsert = this.db.db.prepare(
      `INSERT INTO contacts (user_id, email, name, last_used)
       VALUES (@userId, @email, @name, @now)
       ON CONFLICT(user_id, email) DO UPDATE SET
         name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE contacts.name END,
         last_used = excluded.last_used`,
    )

    const write = this.db.db.transaction((items: ContactAddress[]) => {
      for (const item of items) {
        const email = item.address.trim().toLowerCase()
        if (!email.includes('@') || seen.has(email)) continue
        seen.add(email)
        upsert.run({ userId, email, name: item.name?.trim() ?? '', now })
      }
    })
    write(addresses)
    this.prune(userId)
  }

  search(userId: string, query: string, limit = DEFAULT_LIMIT): ContactDto[] {
    const q = query.trim().toLowerCase()
    const rows = this.db.db
      .prepare(
        `SELECT email, name, last_used AS lastUsed
         FROM contacts
         WHERE user_id = @userId
           AND (@q = '' OR instr(lower(email), @q) > 0 OR instr(lower(name), @q) > 0)
         ORDER BY last_used DESC, email ASC
         LIMIT @limit`,
      )
      .all({ userId, q, limit }) as ContactDto[]
    return rows
  }

  private prune(userId: string): void {
    this.db.db
      .prepare(
        `DELETE FROM contacts
         WHERE user_id = @userId AND email NOT IN (
           SELECT email FROM contacts
           WHERE user_id = @userId
           ORDER BY last_used DESC
           LIMIT @limit
         )`,
      )
      .run({ userId, limit: MAX_CONTACTS_PER_USER })
  }
}
