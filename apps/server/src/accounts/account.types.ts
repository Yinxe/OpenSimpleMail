import type { AccountDto } from '@osm/shared'

export interface AccountRow {
  id: string
  user_id: string
  kind: 'imap' | 'demo'
  name: string
  email: string
  username: string
  secret: string
  imap_host: string
  imap_port: number
  imap_secure: number
  smtp_host: string
  smtp_port: number
  smtp_secure: number
  color: string
  created_at: string
  updated_at: string
}

export function toAccountDto(row: AccountRow): AccountDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    kind: row.kind,
    color: row.color,
    hasPassword: row.secret.length > 0,
    imap: { host: row.imap_host, port: row.imap_port, secure: row.imap_secure === 1 },
    smtp: { host: row.smtp_host, port: row.smtp_port, secure: row.smtp_secure === 1 },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
