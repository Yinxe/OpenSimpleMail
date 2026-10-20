import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import Database from 'better-sqlite3'
import { APP_CONFIG, type AppConfig } from '../config/app.config'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'imap',
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  username   TEXT NOT NULL,
  secret     TEXT NOT NULL,
  imap_host  TEXT NOT NULL DEFAULT '',
  imap_port  INTEGER NOT NULL DEFAULT 993,
  imap_secure INTEGER NOT NULL DEFAULT 1,
  smtp_host  TEXT NOT NULL DEFAULT '',
  smtp_port  INTEGER NOT NULL DEFAULT 465,
  smtp_secure INTEGER NOT NULL DEFAULT 1,
  color      TEXT NOT NULL DEFAULT '#0f766e',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS demo_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id)
);
`

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db: Database.Database

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    if (config.databasePath !== ':memory:') {
      mkdirSync(dirname(config.databasePath), { recursive: true })
    }
    this.db = new Database(config.databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(SCHEMA)
  }

  onModuleDestroy(): void {
    if (this.db.open) this.db.close()
  }
}
