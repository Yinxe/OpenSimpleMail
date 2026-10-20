import { Module, ValidationPipe } from '@nestjs/common'
import { APP_GUARD, APP_PIPE } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AccountsModule } from './accounts/accounts.module'
import { AppController } from './app.controller'
import { AuthModule } from './auth/auth.module'
import { CoreModule } from './core/core.module'
import { DemoModule } from './demo/demo.module'
import { MailModule } from './mail/mail.module'

@Module({
  imports: [
    CoreModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 600 }],
      errorMessage: '请求过于频繁，请稍后再试',
    }),
    DemoModule,
    AuthModule,
    AccountsModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
        transformOptions: { enableImplicitConversion: false },
      }),
    },
  ],
})
export class AppModule {}
