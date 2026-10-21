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
   * socket, and Nest turns off the idle timeout for SSE. Keepalive covers the
   * case where the stream goes quiet: without it the kernel would not probe a
   * half-open connection for two hours. It does not make a dead peer show up
   * faster while the 25-second ping keeps flowing, because every write resets the
   * timer — what ends that connection is the retransmission budget instead (about
   * 15 minutes with the default tcp_retries2=15). Nest's SseStream later calls
   * `setKeepAlive(true)` without a delay, which leaves this interval alone.
   */
  @Sse()
  stream(@CurrentUser('id') userId: string, @Req() request: Request): Observable<MessageEvent> {
    request.socket?.setKeepAlive(true, KEEPALIVE_DELAY_MS)
    return this.events.stream(userId)
  }
}
