import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminGuard } from './admin.guard'

@Module({
  controllers: [AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
