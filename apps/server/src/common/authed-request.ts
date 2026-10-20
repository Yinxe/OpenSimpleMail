import type { UserDto } from '@osm/shared'
import type { Request } from 'express'

export interface AuthedRequest extends Request {
  user?: UserDto
}
