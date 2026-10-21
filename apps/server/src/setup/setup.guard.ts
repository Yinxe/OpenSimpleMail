import {
  CanActivate,
  ExecutionContext,
  Injectable,
  PreconditionFailedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { SettingsService } from '../settings/settings.service'
import { SETUP_ALLOWED_KEY } from './setup.decorators'

@Injectable()
export class SetupGuard implements CanActivate {
  constructor(
    private readonly settings: SettingsService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.settings.isInitialized()) return true

    const allowed = this.reflector.getAllAndOverride<boolean>(SETUP_ALLOWED_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (allowed) return true

    throw new PreconditionFailedException('系统尚未初始化，请先完成启动引导')
  }
}
