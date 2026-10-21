import { Module } from '@nestjs/common'
import { APP_CONFIG, type AppConfig } from '../config/app.config'
import { AttachmentStorage } from './attachment-storage'
import { ParsedMessageCache } from './parsed-cache'

/**
 * The two disk-backed pieces of the mail pipeline. Both are shared between the
 * upload interceptor (configured in MailModule) and the IMAP provider, so they
 * live in their own module: importing it twice still yields one instance.
 */
@Module({
  providers: [
    {
      provide: AttachmentStorage,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new AttachmentStorage(config),
    },
    {
      provide: ParsedMessageCache,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new ParsedMessageCache(config.attachmentCacheMb * 1024 * 1024),
    },
  ],
  exports: [AttachmentStorage, ParsedMessageCache],
})
export class MailStorageModule {}
