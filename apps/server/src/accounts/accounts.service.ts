import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { AccountDto, TestResultDto } from '@osm/shared'
import { APP_CONFIG, type AppConfig } from '../config/app.config'
import { CryptoService } from '../core/crypto.service'
import { DatabaseService } from '../core/database.service'
import { ConnectionTester } from '../mail/connection-tester'
import { ImapPool } from '../mail/imap.pool'
import type { MailCredentials } from '../mail/mail.types'
import { type AccountRow, toAccountDto } from './account.types'
import type { CreateAccountDto, UpdateAccountDto } from './accounts.dto'

const DEFAULT_COLORS = ['#0f766e', '#b45309', '#4338ca', '#be123c', '#0369a1', '#4d7c0f']

@Injectable()
export class AccountsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
    private readonly crypto: CryptoService,
    private readonly tester: ConnectionTester,
    private readonly pool: ImapPool,
  ) {}

  list(userId: string): AccountDto[] {
    const rows = this.db.db
      .prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC')
      .all(userId) as AccountRow[]
    return rows.map(toAccountDto)
  }

  getRow(userId: string, accountId: string): AccountRow {
    const row = this.db.db
      .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
      .get(accountId, userId) as AccountRow | undefined
    if (!row) throw new NotFoundException('邮箱账户不存在')
    return row
  }

  credentialsFor(row: AccountRow): MailCredentials {
    return {
      accountId: row.id,
      name: row.name,
      email: row.email,
      username: row.username,
      password: row.secret ? this.crypto.decryptSecret(row.secret) : '',
      imap: { host: row.imap_host, port: row.imap_port, secure: row.imap_secure === 1 },
      smtp: { host: row.smtp_host, port: row.smtp_port, secure: row.smtp_secure === 1 },
    }
  }

  async create(userId: string, dto: CreateAccountDto): Promise<AccountDto> {
    const email = dto.email.trim().toLowerCase()
    if (!dto.name.trim()) throw new BadRequestException('账户名称不能为空')
    const duplicate = this.db.db
      .prepare('SELECT id FROM accounts WHERE user_id = ? AND lower(email) = ?')
      .get(userId, email)
    if (duplicate) throw new ConflictException('该邮箱已经添加过了')

    const probe: MailCredentials = {
      accountId: `probe-${randomUUID()}`,
      name: dto.name.trim(),
      email,
      username: dto.username.trim(),
      password: dto.password,
      imap: dto.imap,
      smtp: dto.smtp,
    }
    if (!dto.skipTest) await this.verifyOrThrow(probe)

    const now = new Date().toISOString()
    const row: AccountRow = {
      id: randomUUID(),
      user_id: userId,
      kind: 'imap',
      name: dto.name.trim(),
      email,
      username: dto.username.trim(),
      secret: this.crypto.encryptSecret(dto.password),
      imap_host: dto.imap.host.trim(),
      imap_port: dto.imap.port,
      imap_secure: dto.imap.secure ? 1 : 0,
      smtp_host: dto.smtp.host.trim(),
      smtp_port: dto.smtp.port,
      smtp_secure: dto.smtp.secure ? 1 : 0,
      color: dto.color ?? DEFAULT_COLORS[this.list(userId).length % DEFAULT_COLORS.length],
      signature: dto.signature?.trim() ?? '',
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

    return toAccountDto(row)
  }

  async update(userId: string, accountId: string, dto: UpdateAccountDto): Promise<AccountDto> {
    const row = this.getRow(userId, accountId)
    if (row.kind === 'demo') throw new BadRequestException('演示邮箱不支持修改')

    const imap = dto.imap ?? {
      host: row.imap_host,
      port: row.imap_port,
      secure: row.imap_secure === 1,
    }
    const smtp = dto.smtp ?? {
      host: row.smtp_host,
      port: row.smtp_port,
      secure: row.smtp_secure === 1,
    }
    const password = dto.password?.trim()
      ? dto.password
      : row.secret
        ? this.crypto.decryptSecret(row.secret)
        : ''

    const next: AccountRow = {
      ...row,
      name: dto.name?.trim() ?? row.name,
      username: dto.username?.trim() ?? row.username,
      secret: password ? this.crypto.encryptSecret(password) : row.secret,
      imap_host: imap.host.trim(),
      imap_port: imap.port,
      imap_secure: imap.secure ? 1 : 0,
      smtp_host: smtp.host.trim(),
      smtp_port: smtp.port,
      smtp_secure: smtp.secure ? 1 : 0,
      color: dto.color ?? row.color,
      signature: dto.signature?.trim() ?? row.signature,
      updated_at: new Date().toISOString(),
    }

    this.db.db
      .prepare(
        `UPDATE accounts SET
          name = @name, username = @username, secret = @secret,
          imap_host = @imap_host, imap_port = @imap_port, imap_secure = @imap_secure,
          smtp_host = @smtp_host, smtp_port = @smtp_port, smtp_secure = @smtp_secure,
          color = @color, signature = @signature, updated_at = @updated_at
         WHERE id = @id`,
      )
      .run(next)

    this.pool.invalidate(accountId)
    return toAccountDto(next)
  }

  remove(userId: string, accountId: string): void {
    const row = this.getRow(userId, accountId)
    this.pool.invalidate(accountId)
    this.db.db.prepare('DELETE FROM accounts WHERE id = ?').run(row.id)
  }

  async test(userId: string, accountId: string): Promise<TestResultDto> {
    const row = this.getRow(userId, accountId)
    if (row.kind === 'demo') return { imap: 'ok', smtp: 'ok', durationMs: 0 }
    const started = Date.now()
    await this.verifyOrThrow(this.credentialsFor(row))
    return { imap: 'ok', smtp: 'ok', durationMs: Date.now() - started }
  }

  async verifyOrThrow(creds: MailCredentials): Promise<void> {
    try {
      await this.tester.test(creds)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new BadRequestException(`连接邮箱服务器失败：${detail}`)
    }
  }

  /** Used by the mail module; keeps the config dependency out of its constructor. */
  get maxAttachmentBytes(): number {
    return this.config.maxAttachmentMb * 1024 * 1024
  }
}
