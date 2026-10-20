import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common'
import type { AccountDto, TestResultDto } from '@osm/shared'
import { CurrentUser } from '../auth/auth.decorators'
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto'
import { AccountsService } from './accounts.service'

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@CurrentUser('id') userId: string): AccountDto[] {
    return this.accounts.list(userId)
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateAccountDto): Promise<AccountDto> {
    return this.accounts.create(userId, dto)
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountDto> {
    return this.accounts.update(userId, id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser('id') userId: string, @Param('id') id: string): void {
    this.accounts.remove(userId, id)
  }

  @Post(':id/test')
  @HttpCode(200)
  test(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<TestResultDto> {
    return this.accounts.test(userId, id)
  }
}
