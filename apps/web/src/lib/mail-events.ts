import { useEffect } from 'react'

/**
 * Subscribes to the server's new-mail events and calls `onMail` when one arrives.
 *
 * The server keeps an IMAP IDLE connection per account, so this is the only way
 * the list can learn about mail that landed between two polls. Browsers without
 * EventSource (or a proxy that buffers the stream) simply keep polling.
 *
 * `onMail` must be stable: a new function identity reopens the stream.
 */
export function useMailEvents(onMail: () => void): void {
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const source = new EventSource('/api/events')
    source.addEventListener('mail', onMail)
    return () => {
      source.removeEventListener('mail', onMail)
      source.close()
    }
  }, [onMail])
}
