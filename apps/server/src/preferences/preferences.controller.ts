import { Body, Controller, Get, Patch } from '@nestjs/common'
import type { UserPreferencesDto } from '@osm/shared'
import { CurrentUser } from '../auth/auth.decorators'
import { UpdatePreferencesDto } from './preferences.dto'
import { PreferencesService } from './preferences.service'

@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  get(@CurrentUser('id') userId: string): UserPreferencesDto {
    return this.preferences.get(userId)
  }

  @Patch()
  update(@CurrentUser('id') userId: string, @Body() dto: UpdatePreferencesDto): UserPreferencesDto {
    return this.preferences.update(userId, dto)
  }
}
