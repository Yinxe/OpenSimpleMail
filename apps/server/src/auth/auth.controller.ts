import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type {
  AppConfigDto,
  LoginEventDto,
  SessionDto,
  TotpEnabledDto,
  TotpSetupDto,
  TwoFactorChallengeDto,
  UserDto,
} from '@osm/shared'
import type { Request, Response } from 'express'
import { APP_CONFIG, type AppConfig } from '../config/app.config'
import { SettingsService } from '../settings/settings.service'
import { SetupAllowed } from '../setup/setup.decorators'
import { CurrentUser, Public } from './auth.decorators'
import {
  ChangePasswordDto,
  DisableTotpDto,
  LoginDto,
  RecoverAdminDto,
  RegisterDto,
  TotpCodeDto,
  TwoFactorLoginDto,
} from './auth.dto'
import { AuthService, SESSION_COOKIE } from './auth.service'
import { attachSessionCookie, sessionCookieOptions } from './session-cookie'

interface AuthResponse {
  user: UserDto
}

/** Best-effort client address for the session list; proxies are not trusted here. */
function clientIp(req: Request): string | undefined {
  const value = req.ip || req.socket?.remoteAddress
  return value || undefined
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
  ) {}

  @Post('password')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.changePassword(userId, req.cookies?.[SESSION_COOKIE] as string | undefined, dto)
  }

  @Post('totp/setup')
  @HttpCode(200)
  async startTotpSetup(@CurrentUser('id') userId: string): Promise<TotpSetupDto> {
    return this.auth.startTotpSetup(userId)
  }

  @Post('totp/enable')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  async enableTotp(
    @CurrentUser('id') userId: string,
    @Body() dto: TotpCodeDto,
  ): Promise<TotpEnabledDto> {
    return this.auth.enableTotp(userId, dto.code)
  }

  @Post('totp/disable')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  async disableTotp(@CurrentUser('id') userId: string, @Body() dto: DisableTotpDto): Promise<void> {
    await this.auth.disableTotp(userId, dto.password)
  }

  @Get('sessions')
  sessions(@CurrentUser('id') userId: string, @Req() req: Request): SessionDto[] {
    return this.auth.listSessions(userId, req.cookies?.[SESSION_COOKIE] as string | undefined)
  }

  @Get('login-events')
  loginEvents(
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string,
    @Query('limit') limit?: string,
  ): LoginEventDto[] {
    const parsed = limit ? Number.parseInt(limit, 10) : 10
    return this.auth.listLoginEvents(userId, email, Number.isFinite(parsed) ? parsed : 10)
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  revokeOtherSessions(@CurrentUser('id') userId: string, @Req() req: Request): { revoked: number } {
    const revoked = this.auth.revokeOtherSessions(
      userId,
      req.cookies?.[SESSION_COOKIE] as string | undefined,
    )
    return { revoked }
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  revokeSession(
    @CurrentUser('id') userId: string,
    @Param('id') sessionId: string,
    @Req() req: Request,
  ): void {
    this.auth.revokeSession(userId, sessionId, req.cookies?.[SESSION_COOKIE] as string | undefined)
  }

  @Public()
  @SetupAllowed()
  @Get('config')
  getConfig(): AppConfigDto {
    return {
      ...this.settings.get(),
      recoveryEnabled: Boolean(this.config.adminRecoveryPassword),
      version: this.config.version,
      maxAttachmentMb: this.config.maxAttachmentMb,
    }
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.register(dto, req.get('user-agent'), clientIp(req))
    attachSessionCookie(res, session, this.config)
    return { user: session.user }
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse | TwoFactorChallengeDto> {
    const result = await this.auth.login(dto, req.get('user-agent'), clientIp(req))
    if ('twoFactorRequired' in result) return result
    attachSessionCookie(res, result, this.config)
    return { user: result.user }
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login/totp')
  async loginTotp(
    @Body() dto: TwoFactorLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.completeTwoFactor(
      dto.challengeToken,
      dto.code,
      req.get('user-agent'),
      clientIp(req),
    )
    attachSessionCookie(res, session, this.config)
    return { user: session.user }
  }

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(200)
  @Post('demo')
  async demo(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.demoLogin(req.get('user-agent'), clientIp(req))
    attachSessionCookie(res, session, this.config)
    return { user: session.user }
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('recover')
  async recover(
    @Body() dto: RecoverAdminDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.recoverAdmin(dto, req.get('user-agent'), clientIp(req))
    attachSessionCookie(res, session, this.config)
    return { user: session.user }
  }

  @Get('me')
  me(@CurrentUser() user: UserDto): AuthResponse {
    return { user }
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE] as string | undefined)
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(this.config))
  }
}
