import { Injectable, Logger } from '@nestjs/common'
import { ImapPool } from './imap.pool'
import type { MailCredentials } from './mail.types'
import { SmtpService } from './smtp.service'

@Injectable()
export class ConnectionTester {
  private readonly logger = new Logger(ConnectionTester.name)

  constructor(
    private readonly pool: ImapPool,
    private readonly smtp: SmtpService,
  ) {}

  async test(creds: MailCredentials): Promise<void> {
    const started = Date.now()
    await this.pool.verify(creds)
    await this.smtp.verify(creds)
    this.logger.log(
      `Verified ${creds.email} (${creds.imap.host}, ${creds.smtp.host}) in ${Date.now() - started}ms`,
    )
  }
}
