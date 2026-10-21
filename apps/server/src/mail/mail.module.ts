import { Module } from '@nestjs/common'
import { AccountsModule } from '../accounts/accounts.module'
import { ContactsModule } from '../contacts/contacts.module'
import { DemoModule } from '../demo/demo.module'
import { MailController } from './mail.controller'
import { MailService } from './mail.service'
import { MailTransportModule } from './mail-transport.module'

@Module({
  imports: [AccountsModule, ContactsModule, DemoModule, MailTransportModule],
  controllers: [MailController],
  providers: [MailService],
})
export class MailModule {}
