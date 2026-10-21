import { Controller, Get, Query } from '@nestjs/common'
import type { UnifiedMessagePageDto } from '@osm/shared'
import { CurrentUser } from '../auth/auth.decorators'
import { UnifiedQueryDto } from './mail.dto'
import { MailService } from './mail.service'

@Controller('messages')
export class UnifiedController {
  constructor(private readonly mail: MailService) {}

  @Get('unified')
  list(
    @CurrentUser('id') userId: string,
    @Query() query: UnifiedQueryDto,
  ): Promise<UnifiedMessagePageDto> {
    return this.mail.listUnified(userId, {
      mailbox: query.mailbox,
      page: query.page,
      pageSize: query.pageSize,
      query: query.q,
    })
  }
}
