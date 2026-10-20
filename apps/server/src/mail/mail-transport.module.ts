import { Module } from '@nestjs/common'
import { ConnectionTester } from './connection-tester'
import { ImapPool } from './imap.pool'
import { SmtpService } from './smtp.service'

@Module({
  providers: [ImapPool, SmtpService, ConnectionTester],
  exports: [ImapPool, SmtpService, ConnectionTester],
})
export class MailTransportModule {}
