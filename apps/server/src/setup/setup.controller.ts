import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { SystemSettingsDto, UserDto } from '@osm/shared'
import type { Request, Response } from 'express'
import { Public } from '../auth/auth.decorators'
import { AuthService } from '../auth/auth.service'
import { attachSessionCookie } from '../auth/session-cookie'
import { APP_CONFIG, type AppConfig } from '../config/app.config'
import { SettingsService } from '../settings/settings.service'
import { SetupAllowed } from './setup.decorators'
import { SetupDto } from './setup.dto'

interface SetupResponse {
  user: UserDto
}

@Controller('setup')
@SetupAllowed()
export class SetupController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
  ) {}

  @Public()
  @Get('status')
  status(): SystemSettingsDto {
    return this.settings.get()
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post()
  async setup(
    @Body() dto: SetupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SetupResponse> {
    const session = await this.auth.completeSetup(
      dto,
      req.get('user-agent'),
      req.ip || req.socket?.remoteAddress || undefined,
    )
    attachSessionCookie(res, session, this.config)
    return { user: session.user }
  }
}
