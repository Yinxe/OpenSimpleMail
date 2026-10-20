import type { AccountDto, MessageDetailDto } from '@osm/shared'
import {
  Archive,
  ArrowLeft,
  Download,
  FileText,
  Forward,
  ImageOff,
  Mail,
  MailOpen,
  Paperclip,
  Reply,
  Star,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { addressLine, displayAddress, formatBytes, formatFullDate } from '@/lib/format'
import { Avatar } from './Avatar'
import { Spinner } from './Spinner'

interface MessageReaderProps {
  account: AccountDto | null
  message: MessageDetailDto | null
  loading: boolean
  archivePath: string | null
  onClose: () => void
  onReply: (message: MessageDetailDto) => void
  onForward: (message: MessageDetailDto) => void
  onStar: (message: MessageDetailDto) => void
  onDelete: (message: MessageDetailDto) => void
  onToggleRead: (message: MessageDetailDto) => void
  onArchive: (message: MessageDetailDto, destination: string) => void
}

const FRAME_STYLES = `
  html, body { margin: 0; padding: 0; }
  body {
    background: #ffffff;
    color: #24211d;
    font: 15px/1.68 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Hiragino Sans GB", "Microsoft YaHei", Helvetica, Arial, sans-serif;
    padding: 2px 2px 20px;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  img { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
  a { color: #0f766e; }
  blockquote {
    margin: 12px 0;
    padding: 2px 0 2px 14px;
    border-left: 2px solid #e4ded2;
    color: #6b6357;
  }
  pre { white-space: pre-wrap; font-family: inherit; }
  hr { border: 0; border-top: 1px solid #eee8dc; }
`

function hasRemoteImages(html: string): boolean {
  return /<img[^>]+src=["']https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html)
}

function buildDocument(html: string, allowImages: boolean): string {
  const imageSource = allowImages ? "'self' data: cid: https: http:" : "'self' data: cid:"
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imageSource}; style-src 'unsafe-inline'; font-src data:; media-src ${allowImages ? 'data: https: http:' : 'data:'}; connect-src 'none'; form-action 'none'; base-uri 'none';">
<base target="_blank">
<style>${FRAME_STYLES}</style>
</head><body>${html}</body></html>`
}

function EmailFrame({ html, allowImages }: { html: string; allowImages: boolean }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const [height, setHeight] = useState(320)

  useEffect(() => {
    return () => observerRef.current?.disconnect()
  }, [])

  function measure() {
    const frame = frameRef.current
    const doc = frame?.contentDocument
    if (!doc) return
    const next = Math.max(220, doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0)
    setHeight(next)
  }

  function handleLoad() {
    observerRef.current?.disconnect()
    measure()
    const doc = frameRef.current?.contentDocument
    if (doc?.body) {
      const observer = new ResizeObserver(() => measure())
      observer.observe(doc.body)
      observerRef.current = observer
    }
    window.setTimeout(measure, 350)
    window.setTimeout(measure, 1200)
  }

  return (
    <iframe
      ref={frameRef}
      className="email-frame"
      title="邮件正文"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={buildDocument(html, allowImages)}
      style={{ height }}
      onLoad={handleLoad}
    />
  )
}

export function MessageReader({
  account,
  message,
  loading,
  archivePath,
  onClose,
  onReply,
  onForward,
  onStar,
  onDelete,
  onToggleRead,
  onArchive,
}: MessageReaderProps) {
  const [allowImages, setAllowImages] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the image preference for each message
  useEffect(() => {
    setAllowImages(false)
  }, [message?.uid, message?.mailbox])

  if (loading) {
    return (
      <section className="reader reader--loading">
        <div className="reader__loading">
          <Spinner size={22} />
          <span>正在打开邮件…</span>
        </div>
      </section>
    )
  }

  if (!message) {
    return (
      <section className="reader reader--empty">
        <div className="reader-empty">
          <span className="reader-empty__mark">
            <Mail size={30} />
          </span>
          <h2>选一封邮件，慢慢读</h2>
          <p>左侧列表里点开任意一封邮件，这里会显示完整内容。</p>
          <div className="reader-empty__keys">
            <span>
              <kbd>J</kbd>
              <kbd>K</kbd> 切换邮件
            </span>
            <span>
              <kbd>C</kbd> 写邮件
            </span>
            <span>
              <kbd>/</kbd> 搜索
            </span>
          </div>
        </div>
      </section>
    )
  }

  const sender = message.from[0]
  const senderName = sender ? displayAddress(sender) : '未知发件人'
  const blockedImages = message.html !== null && hasRemoteImages(message.html) && !allowImages
  const attachments = message.attachments.filter((item) => !item.inline)
  const attachmentBase = account
    ? `/api/accounts/${account.id}/messages/${message.uid}/attachments`
    : ''

  return (
    <section className="reader">
      <header className="reader__toolbar">
        <div className="reader__toolbar-left">
          <button
            type="button"
            className="icon-button reader__back"
            onClick={onClose}
            aria-label="返回列表"
          >
            <ArrowLeft size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onToggleRead(message)}
            title={message.unread ? '标为已读' : '标为未读'}
            aria-label={message.unread ? '标为已读' : '标为未读'}
          >
            {message.unread ? <MailOpen size={16} /> : <Mail size={16} />}
          </button>
          <button
            type="button"
            className={`icon-button ${message.starred ? 'is-starred' : ''}`}
            onClick={() => onStar(message)}
            title={message.starred ? '取消星标' : '添加星标'}
            aria-label={message.starred ? '取消星标' : '添加星标'}
          >
            <Star size={16} fill={message.starred ? 'currentColor' : 'none'} />
          </button>
          {archivePath ? (
            <button
              type="button"
              className="icon-button"
              onClick={() => onArchive(message, archivePath)}
              title="归档"
              aria-label="归档"
            >
              <Archive size={16} />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button icon-button--danger"
            onClick={() => onDelete(message)}
            title="删除"
            aria-label="删除"
          >
            <Trash2 size={16} />
          </button>
        </div>
        <div className="reader__toolbar-right">
          <button
            type="button"
            className="button button--soft button--sm"
            onClick={() => onReply(message)}
          >
            <Reply size={15} /> 回复
          </button>
          <button
            type="button"
            className="button button--ghost button--sm"
            onClick={() => onForward(message)}
          >
            <Forward size={15} /> 转发
          </button>
        </div>
      </header>

      <div className="reader__scroll">
        <article className="reader__content">
          <div className="reader__subject-row">
            <h1>{message.subject.trim() || '(无主题)'}</h1>
            {message.starred ? (
              <Star size={18} className="reader__star" fill="currentColor" />
            ) : null}
          </div>

          <div className="reader__meta">
            <Avatar name={senderName} seed={sender?.address ?? senderName} size="lg" />
            <div className="reader__meta-text">
              <div className="reader__from">
                <strong>{senderName}</strong>
                {sender?.name ? <span>&lt;{sender.address}&gt;</span> : null}
              </div>
              <div className="reader__recipients">
                发送至 {addressLine(message.to) || '未填写'}
                {message.cc.length > 0 ? ` · 抄送 ${addressLine(message.cc)}` : ''}
              </div>
            </div>
            <time className="reader__date" dateTime={message.date}>
              {formatFullDate(message.date)}
            </time>
          </div>

          {message.replyTo.length > 0 && message.replyTo[0]?.address !== sender?.address ? (
            <p className="reader__reply-to">
              回复至 <strong>{addressLine(message.replyTo)}</strong>
            </p>
          ) : null}

          {blockedImages ? (
            <div className="reader__notice">
              <ImageOff size={16} />
              <span>远程图片已被拦截，以避免发件人追踪你的阅读行为。</span>
              <button type="button" onClick={() => setAllowImages(true)}>
                显示图片
              </button>
            </div>
          ) : null}

          {attachments.length > 0 ? (
            <div className="attachments">
              <div className="attachments__head">
                <Paperclip size={14} />
                {attachments.length} 个附件
              </div>
              <div className="attachments__list">
                {attachments.map((attachment) => (
                  <a
                    key={attachment.index}
                    className="attachment"
                    href={`${attachmentBase}/${attachment.index}?mailbox=${encodeURIComponent(
                      message.mailbox,
                    )}`}
                    download={attachment.filename}
                  >
                    <span className="attachment__icon">
                      <FileText size={18} />
                    </span>
                    <span className="attachment__body">
                      <span className="attachment__name">{attachment.filename}</span>
                      <span className="attachment__size">
                        {formatBytes(attachment.size)} ·{' '}
                        {attachment.contentType.split('/')[1]?.toUpperCase()}
                      </span>
                    </span>
                    <Download size={15} className="attachment__download" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {message.html ? (
            <EmailFrame html={message.html} allowImages={allowImages} />
          ) : (
            <pre className="reader__text">{message.text ?? '(这封邮件没有可显示的正文)'}</pre>
          )}
        </article>
      </div>
    </section>
  )
}
