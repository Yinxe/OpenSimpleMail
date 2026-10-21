import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import type { SystemSettingsDto } from '@osm/shared'
import { UpdateSettingsDto } from '../settings/settings.dto'
import { SettingsService } from '../settings/settings.service'
import { AdminGuard } from './admin.guard'

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly settings: SettingsService) {}

  @Get('settings')
  getSettings(): SystemSettingsDto {
    return this.settings.get()
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateSettingsDto): SystemSettingsDto {
    return this.settings.update(dto)
  }
}
