import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common'
import type { UserDto } from '@osm/shared'
import type { AuthedRequest } from '../common/authed-request'

export const IS_PUBLIC_KEY = 'osm:isPublic'

/** Marks a route as reachable without a session cookie. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

export const CurrentUser = createParamDecorator(
  (
    data: keyof UserDto | undefined,
    context: ExecutionContext,
  ): UserDto | UserDto[keyof UserDto] => {
    const request = context.switchToHttp().getRequest<AuthedRequest>()
    if (!request.user) throw new Error('CurrentUser used on a public route')
    return data ? request.user[data] : request.user
  },
)
