import { Controller, Get, Inject } from '@nestjs/common'
import type { HealthDto } from '@osm/shared'
import { Public } from './auth/auth.decorators'
import { APP_CONFIG, type AppConfig } from './config/app.config'
import { SetupAllowed } from './setup/setup.decorators'

@Controller()
export class AppController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Public()
  @SetupAllowed()
  @Get('health')
  health(): HealthDto {
    return {
      status: 'ok',
      version: this.config.version,
      demoEnabled: this.config.demoEnabled,
    }
  }
}
