import { Controller, type MessageEvent, Sse } from '@nestjs/common'
import type { Observable } from 'rxjs'
import { CurrentUser } from '../auth/auth.decorators'
import { MailEventsService } from './mail-events.service'

@Controller('events')
export class MailEventsController {
  constructor(private readonly events: MailEventsService) {}

  /**
   * Server-sent events for the open tab. The session cookie authenticates the
   * request, so the browser can use a plain EventSource.
   */
  @Sse()
  stream(@CurrentUser('id') userId: string): Observable<MessageEvent> {
    return this.events.stream(userId)
  }
}
