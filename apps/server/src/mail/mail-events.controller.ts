import { Controller, type MessageEvent, Req, Sse } from '@nestjs/common'
import type { Request } from 'express'
import type { Observable } from 'rxjs'
import { CurrentUser } from '../auth/auth.decorators'
import { MailEventsService } from './mail-events.service'

/** How long an idle socket waits before the kernel starts probing a dead peer. */
const KEEPALIVE_DELAY_MS = 30_000

@Controller('events')
export class MailEventsController {
  constructor(private readonly events: MailEventsService) {}

  /**
   * Server-sent events for the open tab. The session cookie authenticates the
   * request, so the browser can use a plain EventSource.
   *
   * The stream is one-way, so the only evidence that a tab is still there is the
   * socket. Nest disables its idle timeout for SSE and only notices a disconnect
   * when a write fails, which on a laptop that went to sleep can take the TCP
   * retransmission budget. Asking the kernel to probe every 30 seconds (plus a
   * 30-second interval, so roughly a minute) closes that gap without a client
   * heartbeat. Nest's SseStream later calls `setKeepAlive(true)` without a delay,
   * which leaves this interval alone.
   */
  @Sse()
  stream(@CurrentUser('id') userId: string, @Req() request: Request): Observable<MessageEvent> {
    request.socket?.setKeepAlive(true, KEEPALIVE_DELAY_MS)
    return this.events.stream(userId)
  }
}
