import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { AccountsModule } from '../accounts/accounts.module'
import { ClamAvService } from '../common/clamav.service'
import { APP_CONFIG, type AppConfig } from '../config/app.config'
import { ContactsModule } from '../contacts/contacts.module'
import { DemoModule } from '../demo/demo.module'
import { AttachmentStorage } from './attachment-storage'
import { MAX_UPLOAD_FILES, MailController } from './mail.controller'
import { MailService } from './mail.service'
import { MailEventsController } from './mail-events.controller'
import { MailEventsService } from './mail-events.service'
import { MailStorageModule } from './mail-storage.module'
import { MailTransportModule } from './mail-transport.module'
import { UnifiedController } from './unified.controller'

@Module({
  imports: [
    AccountsModule,
    ContactsModule,
    DemoModule,
    MailTransportModule,
    MailStorageModule,
    // Uploads land on disk instead of the heap. FilesInterceptor picks these
    // options up from the module, so the route only declares the field name.
    MulterModule.registerAsync({
      imports: [MailStorageModule],
      inject: [APP_CONFIG, AttachmentStorage],
      useFactory: (config: AppConfig, storage: AttachmentStorage) => ({
        storage: storage.uploadEngine(),
        limits: {
          fileSize: config.maxAttachmentMb * 1024 * 1024,
          files: MAX_UPLOAD_FILES,
        },
      }),
    }),
  ],
  controllers: [MailController, UnifiedController, MailEventsController],
  providers: [MailService, MailEventsService, ClamAvService],
})
export class MailModule {}
