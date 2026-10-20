import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_CONFIG, type AppConfig, loadAppConfig } from '../config/app.config'
import { CryptoService } from './crypto.service'
import { DatabaseService } from './database.service'

/**
 * Configuration, SQLite and crypto are needed by almost every feature module,
 * so they live in one global module to keep the dependency graph flat.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env'],
      load: [() => ({ app: loadAppConfig() })],
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AppConfig => config.getOrThrow<AppConfig>('app'),
    },
    DatabaseService,
    CryptoService,
  ],
  exports: [APP_CONFIG, DatabaseService, CryptoService],
})
export class CoreModule {}
