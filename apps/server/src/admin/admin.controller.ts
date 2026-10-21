import { Body, Controller, Delete, Get, Patch, UseGuards } from '@nestjs/common'
import type { AttachmentCacheStatsDto, SystemSettingsDto } from '@osm/shared'
import { AttachmentStorage } from '../mail/attachment-storage'
import { ParsedMessageCache } from '../mail/parsed-cache'
import { UpdateSettingsDto } from '../settings/settings.dto'
import { SettingsService } from '../settings/settings.service'
import { AdminGuard } from './admin.guard'

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly settings: SettingsService,
    private readonly storage: AttachmentStorage,
    private readonly attachments: ParsedMessageCache,
  ) {}

  @Get('settings')
  getSettings(): SystemSettingsDto {
    return this.settings.get()
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateSettingsDto): SystemSettingsDto {
    return this.settings.update(dto)
  }

  @Get('attachments')
  attachmentCache(): AttachmentCacheStatsDto {
    return this.stats()
  }

  /** Drops every extracted attachment. Nothing here is authoritative. */
  @Delete('attachments')
  async clearAttachmentCache(): Promise<AttachmentCacheStatsDto> {
    await this.attachments.clear()
    await this.storage.clearCache()
    return this.stats()
  }

  private stats(): AttachmentCacheStatsDto {
    return { ...this.attachments.stats(), limitBytes: this.storage.cacheLimitBytes }
  }
}
