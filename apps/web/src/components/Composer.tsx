import type { AccountDto, AddressDto, MessageDetailDto, SendResultDto } from '@osm/shared'
import { Bold, Italic, Link2, List, Paperclip, Send, Trash2, Underline, X } from 'lucide-react'
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { type ComposeMode, clearDraft, composeDraftKey, loadDraft, saveDraft } from '@/lib/drafts'
import { addressLine, displayAddress, formatBytes, formatFullDate, previewText } from '@/lib/format'
import { useToast } from '@/lib/toast'
import { Modal } from './Modal'
import { RecipientInput } from './RecipientInput'
import { Spinner } from './Spinner'

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
  if (mode === 'reply' || mode === 'replyAll') {
    return /^re:/i.test(subject) ? subject : `Re: ${subject}`
  }
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

function formatRecipient(address: AddressDto): string {
  const name = address.name?.trim()
  if (!name) return address.address
  // Quote display names containing separators so the comma-separated input is
  // parsed back into the same recipients by Nodemailer.
  const safeName = /[",;]/.test(name) ? `"${name.replace(/"/g, '\\"')}"` : name
  return `${safeName} <${address.address}>`
}

/** Reply-all Cc list: original To + Cc, minus our own addresses and the primary recipient. */
function replyAllCc(source: MessageDetailDto, accounts: AccountDto[], primary: string): string {
  const own = new Set(accounts.map((account) => account.email.toLowerCase()))
  const seen = new Set([primary.toLowerCase()])
  const recipients: string[] = []

  for (const address of [...source.to, ...source.cc]) {
    const key = address.address.toLowerCase()
    if (!key || own.has(key) || seen.has(key)) continue
    seen.add(key)
    recipients.push(formatRecipient(address))
  }
  return recipients.join(', ')
}

function hasMeaningfulHtml(html: string): boolean {
  if (/<img\b/i.test(html)) return true
  return (
    html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .trim().length > 0
  )
}

function signatureHtml(signature: string | undefined): string {
  const text = signature?.trim()
  if (!text) return ''
  return `<div style="color:#6b6357;font-size:13px;line-height:1.6;">${escapeHtml(text).replace(
    /\n/g,
    '<br>',
  )}</div>`
}

/**
 * New messages put the signature below the caret; replies and forwards put it
 * above the quote so the usual top-posting order is preserved.
 */
function composeBody(
  mode: ComposeMode,
  source: MessageDetailDto | null,
  signature: string | undefined,
): string {
  const sig = signatureHtml(signature)
  if (mode === 'new' || !source) return sig ? `<p><br></p>${sig}` : ''
  const template = mode === 'forward' ? forwardBody(source) : quoteBody(source)
  return sig ? `${sig}<p><br></p>${template}` : template
}

function formatSavedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const UNDO_SEND_MS = 5000

export function Composer({
  open,
  mode,
  accounts,
  defaultAccountId,
  source,
  onClose,
  onSent,
}: ComposerProps) {
  const { config, user } = useAuth()
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
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)
  const [bodyVersion, setBodyVersion] = useState(0)
  const [sendDeadline, setSendDeadline] = useState<number | null>(null)
  const [sendRemaining, setSendRemaining] = useState(0)
  const sendTimer = useRef<number | null>(null)
  const sendInFlight = useRef(false)
  const fallbackAccountId = defaultAccountId ?? accounts[0]?.id ?? ''
  const sourceKey = source ? (source.messageId ?? `${source.mailbox}:${source.uid}`) : 'new'
  const draftKey = user ? composeDraftKey(user.id, mode, sourceKey) : null

  const latest = useRef({ accountId, to, cc, bcc, subject })
  latest.current = { accountId, to, cc, bcc, subject }
  const sentRef = useRef(false)
  const dirtyRef = useRef(false)
  const persistRef = useRef<(() => void) | null>(null)

  const persistDraft = useCallback((): void => {
    if (!draftKey || sentRef.current || !dirtyRef.current) return
    const html = editorRef.current?.innerHTML ?? ''
    const empty =
      !to.trim() && !cc.trim() && !bcc.trim() && !subject.trim() && !hasMeaningfulHtml(html)

    if (empty) {
      clearDraft(draftKey)
      setDraftSavedAt(null)
      return
    }

    const savedAt = saveDraft(draftKey, {
      mode,
      sourceKey,
      accountId,
      to,
      cc,
      bcc,
      subject,
      html,
    })
    if (savedAt) setDraftSavedAt(savedAt)
  }, [accountId, bcc, cc, draftKey, mode, sourceKey, subject, to])

  useEffect(() => {
    persistRef.current = () => persistDraft()
  }, [persistDraft])

  // The parent remounts the composer for every compose session, so this effect
  // initialises either the restored draft or the reply/forward template once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initialise once per compose session
  useEffect(() => {
    setError('')
    setFiles([])
    setSending(false)
    setShowCc(false)
    setBodyVersion(0)
    sentRef.current = false
    dirtyRef.current = false

    const saved = draftKey ? loadDraft(draftKey) : null
    if (saved) {
      const restoredAccountId = accounts.some((account) => account.id === saved.accountId)
        ? saved.accountId
        : fallbackAccountId
      setAccountId(restoredAccountId)
      setTo(saved.to)
      setCc(saved.cc)
      setBcc(saved.bcc)
      setShowCc(Boolean(saved.cc || saved.bcc))
      setSubject(saved.subject)
      setDraftSavedAt(saved.savedAt)
      if (editorRef.current) editorRef.current.innerHTML = saved.html
      toast.info('已恢复草稿', '发送成功后会自动清除')
    } else {
      setAccountId(fallbackAccountId)
      setDraftSavedAt(null)
      const signature = accounts.find((account) => account.id === fallbackAccountId)?.signature

      if ((mode === 'reply' || mode === 'replyAll') && source) {
        const target = source.replyTo[0]?.address ?? source.from[0]?.address ?? ''
        setTo(target)
        setCc(mode === 'replyAll' ? replyAllCc(source, accounts, target) : '')
        setBcc('')
        setSubject(subjectWithPrefix(source.subject, mode))
        if (editorRef.current) editorRef.current.innerHTML = composeBody(mode, source, signature)
      } else if (mode === 'forward' && source) {
        setTo('')
        setCc('')
        setBcc('')
        setSubject(subjectWithPrefix(source.subject, mode))
        if (editorRef.current) editorRef.current.innerHTML = composeBody(mode, source, signature)
      } else {
        setTo('')
        setCc('')
        setBcc('')
        setSubject('')
        if (editorRef.current) editorRef.current.innerHTML = composeBody('new', null, signature)
      }
    }

    window.setTimeout(() => {
      if (mode === 'new' && !saved) document.getElementById('compose-to')?.focus()
      else editorRef.current?.focus()
    }, 60)
  }, [])

  // Debounced autosave. bodyVersion changes when the contenteditable fires input,
  // because the editor body is uncontrolled and would not re-render on its own.
  // biome-ignore lint/correctness/useExhaustiveDependencies: bodyVersion is an intentional change signal, not a value read by the effect
  useEffect(() => {
    if (!draftKey) return
    const timer = window.setTimeout(() => persistDraft(), 600)
    return () => window.clearTimeout(timer)
  }, [bodyVersion, draftKey, persistDraft])

  // Persist on unmount as well, so navigating away cannot lose the last keystrokes.
  useEffect(() => {
    return () => {
      persistRef.current?.()
      if (sendTimer.current !== null) window.clearTimeout(sendTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!sendDeadline) return
    const tick = () => {
      setSendRemaining(Math.max(0, Math.ceil((sendDeadline - Date.now()) / 1000)))
    }
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [sendDeadline])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (sentRef.current || !dirtyRef.current) return
      const html = editorRef.current?.innerHTML ?? ''
      if (!latest.current.to.trim() && !latest.current.subject.trim() && !html.trim()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  function requestClose() {
    if (sending) return
    persistDraft()
    if (files.length > 0) {
      const confirmed = window.confirm('附件不会随草稿保存，关闭后需要重新添加。确定关闭吗？')
      if (!confirmed) return
    }
    onClose()
  }

  function discardDraft() {
    if (sending || !draftKey) return
    if (!window.confirm('丢弃这封草稿？此操作不可撤销。')) return
    clearDraft(draftKey)
    dirtyRef.current = false
    setDraftSavedAt(null)
    onClose()
  }

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
    dirtyRef.current = true
    setFiles(next)
    event.target.value = ''
  }

  function cancelPendingSend() {
    if (sendTimer.current === null) return
    window.clearTimeout(sendTimer.current)
    sendTimer.current = null
    sendInFlight.current = false
    setSendDeadline(null)
    setSendRemaining(0)
    setSending(false)
    toast.info('已取消发送', '邮件还在编辑窗口里')
  }

  async function deliver(form: FormData, account: string) {
    try {
      await api.postForm<SendResultDto>(`/accounts/${account}/send`, form)
      sentRef.current = true
      if (draftKey) clearDraft(draftKey)
      setDraftSavedAt(null)
      toast.success(
        '邮件已发送',
        `发件邮箱：${accounts.find((item) => item.id === account)?.email ?? ''}`,
      )
      onSent(account)
      onClose()
    } catch (caught) {
      sendInFlight.current = false
      setError(errorMessage(caught))
      setSending(false)
      setSendDeadline(null)
    }
  }

  function handleSend() {
    if (sendInFlight.current) return
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
    if ((mode === 'reply' || mode === 'replyAll') && source?.messageId) {
      form.append('inReplyTo', source.messageId)
      const references = [...source.references, source.messageId].join(' ')
      form.append('references', references)
    }
    for (const file of files) form.append('attachments', file)

    sendInFlight.current = true
    setSending(true)
    setSendDeadline(Date.now() + UNDO_SEND_MS)
    setSendRemaining(Math.ceil(UNDO_SEND_MS / 1000))
    toast.info('邮件将在 5 秒后发送', '发送前可以撤销', {
      label: '撤销',
      onClick: cancelPendingSend,
    })

    const account = accountId
    sendTimer.current = window.setTimeout(() => {
      sendTimer.current = null
      setSendDeadline(null)
      void deliver(form, account)
    }, UNDO_SEND_MS)
  }

  const title =
    mode === 'replyAll'
      ? '全部回复'
      : mode === 'reply'
        ? '回复邮件'
        : mode === 'forward'
          ? '转发邮件'
          : '写邮件'

  return (
    <Modal
      open={open}
      title={title}
      subtitle={source ? source.subject || '(无主题)' : '支持添加附件与富文本正文'}
      size="lg"
      onClose={sending ? () => undefined : requestClose}
      footer={
        <div className="composer__foot">
          <div className="composer__foot-left">
            <button
              type="button"
              className="button button--ghost button--sm"
              onClick={() => fileRef.current?.click()}
              disabled={sending}
            >
              <Paperclip size={15} />
              添加附件
              {files.length > 0 ? <span className="composer__count">{files.length}</span> : null}
            </button>
            <span className="composer__hint">
              {sending && sendRemaining > 0
                ? `${sendRemaining} 秒后发送 · 可以撤销`
                : sending
                  ? '正在发送…'
                  : 'Ctrl / ⌘ + Enter 发送'}
              {draftSavedAt ? ` · 草稿已保存 ${formatSavedAt(draftSavedAt)}` : ''}
            </span>
          </div>
          <div className="composer__foot-right">
            {sending && sendRemaining > 0 ? (
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={cancelPendingSend}
              >
                撤销发送
              </button>
            ) : null}
            {draftSavedAt ? (
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={discardDraft}
                disabled={sending}
              >
                丢弃草稿
              </button>
            ) : null}
            <button
              type="button"
              className="button button--ghost"
              onClick={requestClose}
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
              {sending ? (sendRemaining > 0 ? `发送中 ${sendRemaining}s` : '发送中') : '发送'}
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
            onChange={(event) => {
              dirtyRef.current = true
              setAccountId(event.target.value)
            }}
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
          <RecipientInput
            id="compose-to"
            value={to}
            onChange={(next) => {
              dirtyRef.current = true
              setTo(next)
            }}
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
              <RecipientInput
                id="compose-cc"
                value={cc}
                onChange={(next) => {
                  dirtyRef.current = true
                  setCc(next)
                }}
                placeholder="可选"
                disabled={sending}
              />
            </div>
            <div className="composer__row">
              <label className="composer__label" htmlFor="compose-bcc">
                密送
              </label>
              <RecipientInput
                id="compose-bcc"
                value={bcc}
                onChange={(next) => {
                  dirtyRef.current = true
                  setBcc(next)
                }}
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
            onChange={(event) => {
              dirtyRef.current = true
              setSubject(event.target.value)
            }}
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
          onInput={() => {
            dirtyRef.current = true
            setBodyVersion((value) => value + 1)
          }}
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
                  disabled={sending}
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
