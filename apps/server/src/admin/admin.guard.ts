import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import type { AuthedRequest } from '../common/authed-request'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>()
    if (!request.user?.isAdmin) throw new ForbiddenException('需要管理员权限')
    return true
  }
}
