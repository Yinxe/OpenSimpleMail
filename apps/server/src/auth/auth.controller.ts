import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { AppConfigDto, UserDto } from '@osm/shared'
import type { Request, Response } from 'express'
import { APP_CONFIG, type AppConfig } from '../config/app.config'
import { CurrentUser, Public } from './auth.decorators'
import { LoginDto, RegisterDto } from './auth.dto'
import { AuthService, SESSION_COOKIE, type SessionResult } from './auth.service'

interface AuthResponse {
  user: UserDto
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Get('config')
  getConfig(): AppConfigDto {
    return {
      demoEnabled: this.config.demoEnabled,
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
    const session = await this.auth.register(dto, req.get('user-agent'))
    this.attachSession(res, session)
    return { user: session.user }
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.login(dto, req.get('user-agent'))
    this.attachSession(res, session)
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
    const session = await this.auth.demoLogin(req.get('user-agent'))
    this.attachSession(res, session)
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
    res.clearCookie(SESSION_COOKIE, this.cookieOptions())
  }

  private attachSession(res: Response, session: SessionResult): void {
    res.cookie(SESSION_COOKIE, session.token, {
      ...this.cookieOptions(),
      maxAge: session.maxAgeMs,
    })
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.cookieSecure,
      path: '/',
    }
  }
}
