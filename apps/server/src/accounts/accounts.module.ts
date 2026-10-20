import { Module } from '@nestjs/common'
import { MailTransportModule } from '../mail/mail-transport.module'
import { AccountsController } from './accounts.controller'
import { AccountsService } from './accounts.service'

@Module({
  imports: [MailTransportModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
