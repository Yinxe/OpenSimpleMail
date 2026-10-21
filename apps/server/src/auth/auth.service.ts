import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
  UnauthorizedException,
} from '@nestjs/common'
import type { UserDto } from '@osm/shared'
import { APP_CONFIG, type AppConfig } from '../config/app.config'
import { CryptoService } from '../core/crypto.service'
import { DatabaseService } from '../core/database.service'
import { DemoService } from '../demo/demo.service'
import { SettingsService } from '../settings/settings.service'
import type { SetupDto } from '../setup/setup.dto'
import type { LoginDto, RecoverAdminDto, RegisterDto } from './auth.dto'

export const SESSION_COOKIE = 'osm_session'

interface UserRow {
  id: string
  email: string
  name: string
  password_hash: string
  is_demo: number
  is_admin: number
  created_at: string
}

interface SessionRow extends UserRow {
  expires_at: string
}

export interface SessionResult {
  user: UserDto
  token: string
  maxAgeMs: number
}

function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isDemo: row.is_demo === 1,
    isAdmin: row.is_admin === 1,
    createdAt: row.created_at,
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
    private readonly crypto: CryptoService,
    private readonly demo: DemoService,
    private readonly settings: SettingsService,
  ) {}

  async register(dto: RegisterDto, userAgent?: string): Promise<SessionResult> {
    const settings = this.settings.get()
    if (!settings.initialized) {
      throw new PreconditionFailedException('系统尚未初始化，请先完成启动引导')
    }
    if (!settings.allowRegistration) {
      throw new ForbiddenException('管理员已关闭公开注册')
    }

    const email = dto.email.trim().toLowerCase()
    if (!dto.name.trim()) throw new BadRequestException('昵称不能为空')
    const existing = this.db.db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) throw new ConflictException('该邮箱已注册')

    const user: UserRow = {
      id: randomUUID(),
      email,
      name: dto.name.trim(),
      password_hash: await this.crypto.hashPassword(dto.password),
      is_demo: 0,
      is_admin: 0,
      created_at: new Date().toISOString(),
    }
    this.db.db
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, is_demo, is_admin, created_at)
         VALUES (@id, @email, @name, @password_hash, @is_demo, @is_admin, @created_at)`,
      )
      .run(user)

    return this.createSession(toUserDto(user), userAgent)
  }

  async login(dto: LoginDto, userAgent?: string): Promise<SessionResult> {
    if (!this.settings.isInitialized()) {
      throw new PreconditionFailedException('系统尚未初始化，请先完成启动引导')
    }
    const email = dto.email.trim().toLowerCase()
    const row = this.db.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      | UserRow
      | undefined

    // Always run a hash comparison to keep the timing of unknown accounts similar.
    const stored = row?.password_hash ?? (await this.crypto.hashPassword('invalid-password'))
    const valid = await this.crypto.verifyPassword(dto.password, stored)
    if (!row || !valid || row.is_demo === 1) {
      throw new UnauthorizedException('邮箱或密码不正确')
    }

    this.db.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString())
    return this.createSession(toUserDto(row), userAgent)
  }

  async demoLogin(userAgent?: string): Promise<SessionResult> {
    const settings = this.settings.get()
    if (!settings.initialized) {
      throw new PreconditionFailedException('系统尚未初始化，请先完成启动引导')
    }
    if (!settings.demoEnabled) throw new UnauthorizedException('演示模式未开启')

    const suffix = this.crypto.randomToken(6).toLowerCase()
    const user: UserRow = {
      id: randomUUID(),
      email: `demo-${suffix}@opensimplemail.local`,
      name: '演示用户',
      password_hash: await this.crypto.hashPassword(this.crypto.randomToken(24)),
      is_demo: 1,
      is_admin: 0,
      created_at: new Date().toISOString(),
    }
    this.db.db
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, is_demo, is_admin, created_at)
         VALUES (@id, @email, @name, @password_hash, @is_demo, @is_admin, @created_at)`,
      )
      .run(user)

    this.demo.ensureAccount(user.id)
    this.pruneDemoUsers()
    this.logger.log(`Created demo workspace for ${user.email}`)
    return this.createSession(toUserDto(user), userAgent)
  }

  /**
   * Emergency recovery for administrators. The recovery password is read from
   * ADMIN_RECOVERY_PASSWORD, never stored in the database. A successful recovery
   * also replaces the password and invalidates every existing session for the
   * account, so the operator can remove the environment variable afterwards.
   */
  async recoverAdmin(dto: RecoverAdminDto, userAgent?: string): Promise<SessionResult> {
    if (!this.config.adminRecoveryPassword) {
      throw new NotFoundException('管理员恢复未启用')
    }

    const email = dto.email.trim().toLowerCase()
    const row = this.db.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      | UserRow
      | undefined

    const validAccount = Boolean(row && row.is_admin === 1 && row.is_demo === 0)
    const validPassword =
      validAccount &&
      this.crypto.safeCompare(dto.recoveryPassword, this.config.adminRecoveryPassword)

    // One generic message for unknown accounts, non-admin accounts and a wrong
    // recovery password avoids account enumeration.
    if (!row || !validAccount || !validPassword) {
      throw new UnauthorizedException('恢复信息不正确')
    }

    const passwordHash = await this.crypto.hashPassword(dto.newPassword)
    const transaction = this.db.db.transaction(() => {
      this.db.db
        .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(passwordHash, row.id)
      this.db.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id)
    })
    transaction()

    this.logger.warn(
      `Administrator recovery used for ${email}; unset ADMIN_RECOVERY_PASSWORD after signing in`,
    )
    return this.createSession(toUserDto({ ...row, password_hash: passwordHash }), userAgent)
  }

  /**
   * First-run setup: create the administrator and persist the initial system
   * configuration in one transaction. The wizard is the only caller.
   */
  async completeSetup(dto: SetupDto, userAgent?: string): Promise<SessionResult> {
    if (this.settings.isInitialized()) {
      throw new ConflictException('系统已经初始化，无需重复执行启动引导')
    }
    if (!dto.admin.name.trim()) throw new BadRequestException('管理员昵称不能为空')

    const email = dto.admin.email.trim().toLowerCase()
    const existing = this.db.db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) throw new ConflictException('该邮箱已注册')

    const passwordHash = await this.crypto.hashPassword(dto.admin.password)
    const user: UserRow = {
      id: randomUUID(),
      email,
      name: dto.admin.name.trim(),
      password_hash: passwordHash,
      is_demo: 0,
      is_admin: 1,
      created_at: new Date().toISOString(),
    }

    const transaction = this.db.db.transaction(() => {
      if (this.settings.isInitialized()) {
        throw new ConflictException('系统已经初始化，无需重复执行启动引导')
      }
      this.db.db
        .prepare(
          `INSERT INTO users (id, email, name, password_hash, is_demo, is_admin, created_at)
           VALUES (@id, @email, @name, @password_hash, @is_demo, @is_admin, @created_at)`,
        )
        .run(user)
      this.settings.completeSetup({
        siteName: dto.siteName,
        allowRegistration: dto.allowRegistration,
        demoEnabled: dto.demoEnabled,
      })
    })
    transaction()

    this.logger.log(`Completed first-run setup for ${email}`)
    return this.createSession(toUserDto(user), userAgent)
  }

  private pruneDemoUsers(): void {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    this.db.db.prepare('DELETE FROM users WHERE is_demo = 1 AND created_at < ?').run(cutoff)
  }

  async resolveSession(token: string): Promise<UserDto | null> {
    const tokenHash = this.crypto.sha256(token)
    const row = this.db.db
      .prepare(
        `SELECT u.*, s.expires_at FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
      )
      .get(tokenHash) as SessionRow | undefined

    if (!row) return null
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      this.db.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
      return null
    }
    return toUserDto(row)
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return
    this.db.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(this.crypto.sha256(token))
  }

  private createSession(user: UserDto, userAgent?: string): SessionResult {
    const token = this.crypto.randomToken(32)
    const now = new Date()
    const maxAgeMs = this.config.sessionDays * 24 * 60 * 60 * 1000
    const expiresAt = new Date(now.getTime() + maxAgeMs)

    this.db.db
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, user_agent, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        user.id,
        this.crypto.sha256(token),
        userAgent?.slice(0, 255) ?? null,
        now.toISOString(),
        expiresAt.toISOString(),
      )

    return { user, token, maxAgeMs }
  }
}
