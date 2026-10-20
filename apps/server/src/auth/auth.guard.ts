import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { AuthedRequest } from '../common/authed-request'
import { IS_PUBLIC_KEY } from './auth.decorators'
import { AuthService, SESSION_COOKIE } from './auth.service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<AuthedRequest>()
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined
    if (!token) throw new UnauthorizedException('请先登录')

    const user = await this.auth.resolveSession(token)
    if (!user) throw new UnauthorizedException('登录已过期，请重新登录')
    request.user = user
    return true
  }
}
