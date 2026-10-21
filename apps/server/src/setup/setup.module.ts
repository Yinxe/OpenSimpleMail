import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { SetupController } from './setup.controller'

@Module({
  imports: [AuthModule],
  controllers: [SetupController],
})
export class SetupModule {}
