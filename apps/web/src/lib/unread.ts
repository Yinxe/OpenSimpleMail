import { useEffect, useRef } from 'react'

const ICON_SELECTOR = 'link[rel="icon"]'
const DEFAULT_ICON = '/favicon.svg'

function drawBadge(count: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return DEFAULT_ICON

  context.fillStyle = '#c4553b'
  context.beginPath()
  context.arc(32, 32, 30, 0, Math.PI * 2)
  context.fill()

  context.fillStyle = '#fffdf8'
  context.font = 'bold 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(count > 99 ? '99+' : String(count), 32, 35)
  return canvas.toDataURL('image/png')
}

/** Replaces the favicon with a count badge while unread mail exists. */
export function useUnreadBadge(count: number): void {
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>(ICON_SELECTOR)
    if (!icon) return
    icon.href = count > 0 ? drawBadge(count) : DEFAULT_ICON
  }, [count])
}

interface NewMailNotificationOptions {
  count: number
  enabled: boolean
  ready: boolean
  siteName: string
  onOpen: () => void
}

/**
 * Shows a desktop notification when the unread count grows while the tab is in
 * the background. The first load is treated as a baseline, not as new mail.
 */
export function useNewMailNotifications({
  count,
  enabled,
  ready,
  siteName,
  onOpen,
}: NewMailNotificationOptions): void {
  const previous = useRef<number | null>(null)
  const initialized = useRef(false)
  const openRef = useRef(onOpen)
  openRef.current = onOpen

  useEffect(() => {
    const before = previous.current
    previous.current = count
    if (!ready) return
    if (!initialized.current) {
      initialized.current = true
      return
    }
    if (before === null || count <= before) return
    if (!enabled || !document.hidden) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    const delta = count - before
    try {
      const notification = new Notification(
        delta === 1 ? '收到 1 封新邮件' : `收到 ${delta} 封新邮件`,
        {
          body: `${siteName} · 点击打开收件箱`,
          icon: DEFAULT_ICON,
          tag: 'osm-new-mail',
        },
      )
      notification.onclick = () => {
        window.focus()
        openRef.current()
        notification.close()
      }
    } catch {
      // Some platforms only allow notifications through a service worker.
    }
  }, [count, enabled, ready, siteName])
}
