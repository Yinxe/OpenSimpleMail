import { Module } from '@nestjs/common'
import { MailStorageModule } from '../mail/mail-storage.module'
import { AdminController } from './admin.controller'
import { AdminGuard } from './admin.guard'

@Module({
  imports: [MailStorageModule],
  controllers: [AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
