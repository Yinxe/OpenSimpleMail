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
  is_admin      INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_seconds    INTEGER NOT NULL DEFAULT 60,
  page_size          INTEGER NOT NULL DEFAULT 30,
  auto_mark_read     INTEGER NOT NULL DEFAULT 1,
  load_remote_images INTEGER NOT NULL DEFAULT 0,
  default_view       TEXT NOT NULL DEFAULT 'account',
  density            TEXT NOT NULL DEFAULT 'comfortable',
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  site_name            TEXT NOT NULL DEFAULT 'OpenSimpleMail',
  allow_registration   INTEGER NOT NULL DEFAULT 0,
  demo_enabled         INTEGER NOT NULL DEFAULT 1,
  setup_completed_at   TEXT,
  updated_at           TEXT NOT NULL
);
`

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db: Database.Database

  private readonly config: AppConfig

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.config = config
    if (config.databasePath !== ':memory:') {
      mkdirSync(dirname(config.databasePath), { recursive: true })
    }
    this.db = new Database(config.databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(SCHEMA)
    this.migrate()
  }

  /**
   * Small, idempotent migrations for installations created before the setup
   * wizard existed. New databases already contain every column/table.
   */
  private migrate(): void {
    const userColumns = this.db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
    if (!userColumns.some((column) => column.name === 'is_admin')) {
      this.db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
    }

    const settings = this.db
      .prepare('SELECT setup_completed_at FROM app_settings WHERE id = 1')
      .get() as { setup_completed_at: string | null } | undefined

    if (!settings) {
      const users = this.db.prepare('SELECT COUNT(*) AS count FROM users').get() as {
        count: number
      }
      const now = new Date().toISOString()

      if (users.count > 0) {
        // Upgrading an existing installation: keep registration open as it was,
        // and promote the oldest account so there is always an administrator.
        this.db
          .prepare(
            `INSERT INTO app_settings (
              id, site_name, allow_registration, demo_enabled, setup_completed_at, updated_at
            ) VALUES (1, 'OpenSimpleMail', 1, @demo, @now, @now)`,
          )
          .run({ demo: this.config.demoEnabled ? 1 : 0, now })
        this.promoteOldestUser()
      } else {
        this.db
          .prepare(
            `INSERT INTO app_settings (
              id, site_name, allow_registration, demo_enabled, setup_completed_at, updated_at
            ) VALUES (1, 'OpenSimpleMail', 0, @demo, NULL, @now)`,
          )
          .run({ demo: this.config.demoEnabled ? 1 : 0, now })
      }
      return
    }

    if (settings.setup_completed_at) this.promoteOldestUserIfNoAdmin()
  }

  private promoteOldestUser(): void {
    const oldest = this.db
      .prepare('SELECT id FROM users ORDER BY created_at ASC, rowid ASC LIMIT 1')
      .get() as { id: string } | undefined
    if (oldest) this.db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(oldest.id)
  }

  private promoteOldestUserIfNoAdmin(): void {
    const admins = this.db
      .prepare('SELECT COUNT(*) AS count FROM users WHERE is_admin = 1')
      .get() as { count: number }
    if (admins.count === 0) this.promoteOldestUser()
  }

  onModuleDestroy(): void {
    if (this.db.open) this.db.close()
  }
}
