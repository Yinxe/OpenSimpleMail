import { Controller, Get, Query } from '@nestjs/common'
import type { ContactDto } from '@osm/shared'
import { CurrentUser } from '../auth/auth.decorators'
import { ContactsService } from './contacts.service'

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  search(@CurrentUser('id') userId: string, @Query('q') query = ''): ContactDto[] {
    return this.contacts.search(userId, query)
  }
}
