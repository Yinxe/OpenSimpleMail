import type { AccountDto, MessageDetailDto } from '@osm/shared'
import {
  AlignLeft,
  Archive,
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  Download,
  FileText,
  Forward,
  ImageOff,
  KeyRound,
  LayoutTemplate,
  Mail,
  MailOpen,
  Paperclip,
  Reply,
  ReplyAll,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { copyToClipboard } from '@/lib/clipboard'
import { addressLine, displayAddress, formatBytes, formatFullDate } from '@/lib/format'
import {
  type ContentBlock,
  type ContentInline,
  htmlToPlainText,
  messageToBlocks,
} from '@/lib/message-content'
import { READER_MODES, type ReaderMode, readReaderMode, writeReaderMode } from '@/lib/reader-mode'
import { useToast } from '@/lib/toast'
import { findVerificationCode, type VerificationResult } from '@/lib/verification-code'
import { Avatar } from './Avatar'
import { Spinner } from './Spinner'

interface MessageReaderProps {
  account: AccountDto | null
  message: MessageDetailDto | null
  loading: boolean
  defaultAllowImages: boolean
  archivePath: string | null
  onClose: () => void
  onReply: (message: MessageDetailDto) => void
  onReplyAll: (message: MessageDetailDto) => void
  onForward: (message: MessageDetailDto) => void
  onStar: (message: MessageDetailDto) => void
  onDelete: (message: MessageDetailDto) => void
  onToggleRead: (message: MessageDetailDto) => void
  onArchive: (message: MessageDetailDto, destination: string) => void
}

const EMPTY_CODE_RESULT: VerificationResult = {
  code: null,
  candidates: [],
  context: null,
  expiry: null,
  source: null,
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

function renderInlines(inlines: ContentInline[]) {
  return inlines.map((inline, index) => {
    if (typeof inline === 'string') {
      return <Fragment key={index}>{inline}</Fragment>
    }
    return (
      <a key={index} href={inline.href} target="_blank" rel="noreferrer noopener">
        {inline.text}
      </a>
    )
  })
}

function SimpleBody({ blocks }: { blocks: ContentBlock[] }) {
  if (blocks.length === 0) {
    return <p className="reader__empty-body">这封邮件没有可显示的正文。</p>
  }

  return (
    <div className="reader-simple">
      {blocks.map((block, index) => {
        if (block.kind === 'divider') return <hr key={index} />
        if (block.kind === 'heading') {
          return (
            <h2 key={index} className="reader-simple__heading">
              {renderInlines(block.inlines)}
            </h2>
          )
        }
        if (block.kind === 'quote') {
          return (
            <blockquote key={index} className="reader-simple__quote">
              {renderInlines(block.inlines)}
            </blockquote>
          )
        }
        if (block.kind === 'list-item') {
          return (
            <p key={index} className="reader-simple__item">
              <span className="reader-simple__bullet" aria-hidden="true">
                •
              </span>
              <span>{renderInlines(block.inlines)}</span>
            </p>
          )
        }
        return (
          <p key={index} className="reader-simple__paragraph">
            {renderInlines(block.inlines)}
          </p>
        )
      })}
    </div>
  )
}

interface VerificationBodyProps {
  result: VerificationResult
  senderName: string
  senderAddress: string
  onShowFull: () => void
  onShowText: () => void
}

function VerificationBody({
  result,
  senderName,
  senderAddress,
  onShowFull,
  onShowText,
}: VerificationBodyProps) {
  const toast = useToast()
  const [copied, setCopied] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  async function copy(code: string) {
    const copiedOk = await copyToClipboard(code)
    if (!copiedOk) {
      toast.error('复制失败', '请手动选中验证码后复制')
      return
    }
    setCopied(code)
    toast.success('验证码已复制', code)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setCopied(null), 2200)
  }

  const code = result.code
  if (!code) {
    return (
      <div className="otp otp--empty">
        <span className="otp__empty-mark" aria-hidden="true">
          <KeyRound size={24} />
        </span>
        <h2>没有识别到验证码</h2>
        <p>这封邮件里没有找到常见的验证码格式。可以回到完整内容手动查看。</p>
        <div className="otp__empty-actions">
          <button type="button" className="button button--soft button--sm" onClick={onShowFull}>
            查看完整内容
          </button>
          <button type="button" className="button button--ghost button--sm" onClick={onShowText}>
            查看简约文字
          </button>
        </div>
      </div>
    )
  }

  const alternatives = result.candidates.filter((candidate) => candidate.code !== code).slice(0, 3)

  return (
    <div className="otp">
      <div className="otp__card">
        <div className="otp__head">
          <span className="otp__icon" aria-hidden="true">
            <KeyRound size={17} />
          </span>
          <span className="otp__label">验证码</span>
          {result.expiry ? (
            <span className="otp__expiry">
              <Clock3 size={12} aria-hidden="true" />
              {result.expiry}
            </span>
          ) : null}
        </div>

        <div className="otp__code">{code}</div>

        <button
          type="button"
          className={`button otp__copy ${copied === code ? 'button--soft' : 'button--primary'}`}
          onClick={() => copy(code)}
          aria-live="polite"
        >
          {copied === code ? <Check size={16} /> : <Copy size={16} />}
          {copied === code ? '已复制' : '复制验证码'}
        </button>

        {result.context ? <p className="otp__context">{result.context}</p> : null}

        <div className="otp__foot">
          <span className="otp__sender" title={senderAddress}>
            来自 {senderName}
          </span>
          <button type="button" onClick={onShowFull}>
            查看完整内容
          </button>
        </div>
      </div>

      {alternatives.length > 0 ? (
        <div className="otp__alternatives">
          <span>其他候选</span>
          {alternatives.map((candidate) => (
            <button
              key={candidate.code}
              type="button"
              className="otp__alt"
              onClick={() => copy(candidate.code)}
              title={`复制 ${candidate.code}`}
            >
              <code>{candidate.code}</code>
              <Copy size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      <p className="otp__safe">
        <ShieldCheck size={12} aria-hidden="true" />
        验证码仅用于本次验证，请勿转发给他人。
      </p>
    </div>
  )
}

export function MessageReader({
  account,
  message,
  loading,
  defaultAllowImages,
  archivePath,
  onClose,
  onReply,
  onReplyAll,
  onForward,
  onStar,
  onDelete,
  onToggleRead,
  onArchive,
}: MessageReaderProps) {
  const [allowImages, setAllowImages] = useState(defaultAllowImages)
  const [mode, setMode] = useState<ReaderMode>(readReaderMode)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the image preference for each message
  useEffect(() => {
    setAllowImages(defaultAllowImages)
  }, [defaultAllowImages, message?.uid, message?.mailbox])

  useEffect(() => {
    writeReaderMode(mode)
  }, [mode])

  const codeResult = useMemo(() => {
    if (!message) return EMPTY_CODE_RESULT
    return findVerificationCode({
      subject: message.subject,
      text: message.text,
      htmlText: message.html ? htmlToPlainText(message.html) : '',
    })
  }, [message])

  const simpleBlocks = useMemo(() => (message ? messageToBlocks(message) : []), [message])

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

  const modeHint =
    mode === 'text'
      ? '已去除图片与样式'
      : mode === 'code'
        ? codeResult.code
          ? '已自动识别'
          : '未识别到验证码'
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
            title={message.starred ? '取消收藏' : '收藏（可在左侧「收藏」查看）'}
            aria-label={message.starred ? '取消收藏' : '收藏'}
            aria-pressed={message.starred}
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
            onClick={() => onReplyAll(message)}
            title="回复发件人和所有收件人（A）"
          >
            <ReplyAll size={15} /> 全部回复
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

          <div className="reader__viewbar">
            <div className="reader-modes" role="tablist" aria-label="正文渲染方式">
              {READER_MODES.map((item) => {
                const Icon =
                  item.value === 'full'
                    ? LayoutTemplate
                    : item.value === 'text'
                      ? AlignLeft
                      : KeyRound
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={mode === item.value}
                    aria-controls="reader-body"
                    className={`reader-mode ${mode === item.value ? 'is-active' : ''}`}
                    onClick={() => setMode(item.value)}
                  >
                    <Icon size={14} aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.value === 'code' && codeResult.code ? (
                      <span className="reader-mode__dot" title="已识别到验证码" />
                    ) : null}
                  </button>
                )
              })}
            </div>
            {modeHint ? <span className="reader__viewhint">{modeHint}</span> : null}
          </div>

          {mode === 'full' && blockedImages ? (
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

          <div id="reader-body" role="tabpanel">
            {mode === 'full' ? (
              message.html ? (
                <EmailFrame html={message.html} allowImages={allowImages} />
              ) : (
                <pre className="reader__text">{message.text ?? '(这封邮件没有可显示的正文)'}</pre>
              )
            ) : mode === 'text' ? (
              <SimpleBody blocks={simpleBlocks} />
            ) : (
              <VerificationBody
                result={codeResult}
                senderName={senderName}
                senderAddress={sender?.address ?? ''}
                onShowFull={() => setMode('full')}
                onShowText={() => setMode('text')}
              />
            )}
          </div>
        </article>
      </div>
    </section>
  )
}
