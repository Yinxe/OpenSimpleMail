import type { AccountDto, MessageDetailDto, SendResultDto } from '@osm/shared'
import { Bold, Italic, Link2, List, Paperclip, Send, Trash2, Underline, X } from 'lucide-react'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { addressLine, displayAddress, formatBytes, formatFullDate, previewText } from '@/lib/format'
import { useToast } from '@/lib/toast'
import { Modal } from './Modal'
import { Spinner } from './Spinner'

export type ComposeMode = 'new' | 'reply' | 'forward'

interface ComposerProps {
  open: boolean
  mode: ComposeMode
  accounts: AccountDto[]
  defaultAccountId: string | null
  source?: MessageDetailDto | null
  onClose: () => void
  onSent: (accountId: string) => void
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function subjectWithPrefix(subject: string, mode: ComposeMode): string {
  if (mode === 'reply') return /^re:/i.test(subject) ? subject : `Re: ${subject}`
  if (mode === 'forward') return /^fwd?:/i.test(subject) ? subject : `Fwd: ${subject}`
  return ''
}

function quoteBody(source: MessageDetailDto): string {
  const text = source.text?.trim() || previewText(source.html, null) || '(无正文)'
  const quoted = text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return `<p><br></p><p style="color:#8a8174;font-size:13px;">在 ${escapeHtml(
    formatFullDate(source.date),
  )}，${escapeHtml(addressLine(source.from))} 写道：</p><blockquote style="margin:0;padding-left:14px;border-left:2px solid #e4ded2;color:#6b6357;white-space:pre-wrap;">${escapeHtml(
    quoted,
  )}</blockquote>`
}

function forwardBody(source: MessageDetailDto): string {
  const text = source.text?.trim() || previewText(source.html, null) || '(无正文)'
  return `<p><br></p><p style="color:#8a8174;font-size:13px;">---------- 转发邮件 ----------</p><p style="color:#8a8174;font-size:13px;">发件人：${escapeHtml(
    addressLine(source.from),
  )}<br>日期：${escapeHtml(formatFullDate(source.date))}<br>主题：${escapeHtml(
    source.subject,
  )}<br>收件人：${escapeHtml(addressLine(source.to))}</p><blockquote style="margin:0;padding-left:14px;border-left:2px solid #e4ded2;color:#6b6357;white-space:pre-wrap;">${escapeHtml(
    text,
  )}</blockquote>`
}

function wrapOutgoingHtml(inner: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#24211d;">${inner}</div>`
}

export function Composer({
  open,
  mode,
  accounts,
  defaultAccountId,
  source,
  onClose,
  onSent,
}: ComposerProps) {
  const { config } = useAuth()
  const toast = useToast()
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? '')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const fallbackAccountId = defaultAccountId ?? accounts[0]?.id ?? ''

  // The parent remounts the composer for every compose session (new/reply/forward),
  // so this effect only needs to initialise the draft once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initialise once per compose session
  useEffect(() => {
    setAccountId(fallbackAccountId)
    setError('')
    setFiles([])
    setSending(false)
    setShowCc(false)

    if (mode === 'reply' && source) {
      const target = source.replyTo[0]?.address ?? source.from[0]?.address ?? ''
      setTo(target)
      setCc('')
      setBcc('')
      setSubject(subjectWithPrefix(source.subject, mode))
      if (editorRef.current) editorRef.current.innerHTML = quoteBody(source)
    } else if (mode === 'forward' && source) {
      setTo('')
      setCc('')
      setBcc('')
      setSubject(subjectWithPrefix(source.subject, mode))
      if (editorRef.current) editorRef.current.innerHTML = forwardBody(source)
    } else {
      setTo('')
      setCc('')
      setBcc('')
      setSubject('')
      if (editorRef.current) editorRef.current.innerHTML = ''
    }
    window.setTimeout(() => {
      if (mode === 'new') document.getElementById('compose-to')?.focus()
      else editorRef.current?.focus()
    }, 60)
  }, [])

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
  }

  function addLink() {
    const url = window.prompt('输入链接地址')
    if (url) runCommand('createLink', url)
  }

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    if (picked.length === 0) return
    const limitMb = config?.maxAttachmentMb ?? 25
    const next = [...files, ...picked]
    const total = next.reduce((sum, file) => sum + file.size, 0)
    if (total > limitMb * 1024 * 1024) {
      toast.error('附件过大', `附件总大小不能超过 ${limitMb} MB`)
      event.target.value = ''
      return
    }
    setFiles(next)
    event.target.value = ''
  }

  async function handleSend() {
    setError('')
    if (!accountId) {
      setError('请选择一个发件邮箱')
      return
    }
    if (![to, cc, bcc].some((value) => value.trim())) {
      setError('请至少填写一个收件人')
      return
    }
    const bodyText = editorRef.current?.innerText.trim() ?? ''
    if (!subject.trim() && !bodyText && files.length === 0) {
      setError('写点什么再发送吧')
      return
    }

    const form = new FormData()
    form.append('to', to.trim())
    if (cc.trim()) form.append('cc', cc.trim())
    if (bcc.trim()) form.append('bcc', bcc.trim())
    form.append('subject', subject.trim())
    form.append('text', bodyText)
    form.append('html', wrapOutgoingHtml(editorRef.current?.innerHTML ?? ''))
    if (mode === 'reply' && source?.messageId) {
      form.append('inReplyTo', source.messageId)
      const references = [...source.references, source.messageId].join(' ')
      form.append('references', references)
    }
    for (const file of files) form.append('attachments', file)

    setSending(true)
    try {
      await api.postForm<SendResultDto>(`/accounts/${accountId}/send`, form)
      toast.success(
        '邮件已发送',
        `发件邮箱：${accounts.find((item) => item.id === accountId)?.email ?? ''}`,
      )
      onSent(accountId)
      onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      title={mode === 'reply' ? '回复邮件' : mode === 'forward' ? '转发邮件' : '写邮件'}
      subtitle={source ? source.subject || '(无主题)' : '支持添加附件与富文本正文'}
      size="lg"
      onClose={sending ? () => undefined : onClose}
      footer={
        <div className="composer__foot">
          <div className="composer__foot-left">
            <button
              type="button"
              className="button button--ghost button--sm"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={15} />
              添加附件
              {files.length > 0 ? <span className="composer__count">{files.length}</span> : null}
            </button>
            <span className="composer__hint">Ctrl / ⌘ + Enter 发送</span>
          </div>
          <div className="composer__foot-right">
            <button
              type="button"
              className="button button--ghost"
              onClick={onClose}
              disabled={sending}
            >
              取消
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={handleSend}
              disabled={sending}
            >
              {sending ? <Spinner /> : <Send size={16} />}
              发送
            </button>
          </div>
        </div>
      }
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Ctrl/Cmd+Enter is a keyboard convenience; every action also has a button */}
      <div
        className="composer"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            void handleSend()
          }
        }}
      >
        <div className="composer__row">
          <label className="composer__label" htmlFor="compose-from">
            发件人
          </label>
          <select
            id="compose-from"
            className="composer__select"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            disabled={sending}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} &lt;{account.email}&gt;
              </option>
            ))}
          </select>
        </div>

        <div className="composer__row">
          <label className="composer__label" htmlFor="compose-to">
            收件人
          </label>
          <input
            id="compose-to"
            className="composer__input"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="name@example.com，多个地址用逗号分隔"
            disabled={sending}
          />
          <button
            type="button"
            className="composer__cc-toggle"
            onClick={() => setShowCc((value) => !value)}
          >
            {showCc ? '收起抄送' : '抄送 / 密送'}
          </button>
        </div>

        {showCc ? (
          <>
            <div className="composer__row">
              <label className="composer__label" htmlFor="compose-cc">
                抄送
              </label>
              <input
                id="compose-cc"
                className="composer__input"
                value={cc}
                onChange={(event) => setCc(event.target.value)}
                placeholder="可选"
                disabled={sending}
              />
            </div>
            <div className="composer__row">
              <label className="composer__label" htmlFor="compose-bcc">
                密送
              </label>
              <input
                id="compose-bcc"
                className="composer__input"
                value={bcc}
                onChange={(event) => setBcc(event.target.value)}
                placeholder="可选"
                disabled={sending}
              />
            </div>
          </>
        ) : null}

        <div className="composer__row">
          <label className="composer__label" htmlFor="compose-subject">
            主题
          </label>
          <input
            id="compose-subject"
            className="composer__input"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="这封邮件是关于…"
            disabled={sending}
          />
        </div>

        <div className="composer__toolbar">
          <button type="button" onClick={() => runCommand('bold')} title="加粗" aria-label="加粗">
            <Bold size={15} />
          </button>
          <button type="button" onClick={() => runCommand('italic')} title="斜体" aria-label="斜体">
            <Italic size={15} />
          </button>
          <button
            type="button"
            onClick={() => runCommand('underline')}
            title="下划线"
            aria-label="下划线"
          >
            <Underline size={15} />
          </button>
          <span className="composer__toolbar-sep" />
          <button
            type="button"
            onClick={() => runCommand('insertUnorderedList')}
            title="无序列表"
            aria-label="无序列表"
          >
            <List size={15} />
          </button>
          <button type="button" onClick={addLink} title="插入链接" aria-label="插入链接">
            <Link2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => runCommand('removeFormat')}
            title="清除格式"
            aria-label="清除格式"
          >
            <X size={15} />
          </button>
        </div>

        {/* biome-ignore lint/a11y/useSemanticElements: contenteditable rich-text editor */}
        <div
          ref={editorRef}
          className="composer__editor"
          contentEditable={!sending}
          suppressContentEditableWarning
          role="textbox"
          tabIndex={0}
          aria-multiline="true"
          aria-label="邮件正文"
          data-placeholder="写点什么…"
        />

        {files.length > 0 ? (
          <div className="composer__files">
            {files.map((file, index) => (
              <span className="composer__file" key={`${file.name}-${index}`}>
                <Paperclip size={13} />
                <span className="composer__file-name">{file.name}</span>
                <span className="composer__file-size">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, itemIndex) => itemIndex !== index))}
                  aria-label={`移除 ${file.name}`}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {error ? <p className="form__error">{error}</p> : null}

        <input ref={fileRef} type="file" multiple hidden onChange={onPickFiles} />
        {source ? (
          <p className="composer__source">
            关联邮件：{displayAddress(source.from[0] ?? { name: null, address: '' })} ·{' '}
            {formatFullDate(source.date)}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
