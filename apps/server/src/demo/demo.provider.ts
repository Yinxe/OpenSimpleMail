import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  type MailboxDto,
  type MessageDetailDto,
  type MessagePageDto,
  type MessageSummaryDto,
  type SendResultDto,
  STARRED_MAILBOX,
  type TestResultDto,
} from '@osm/shared'
import type { AccountRow } from '../accounts/account.types'
import type {
  AttachmentPayload,
  DeleteResult,
  DraftPayload,
  FlagUpdate,
  ListMessagesOptions,
  MailProvider,
  MoveOutcome,
  OutgoingMessage,
  SavedDraft,
} from '../mail/mail.types'
import { sanitizeEmailHtml } from '../mail/message-sanitizer'
import type { DemoMessage } from './demo.fixtures'
import type { DemoService } from './demo.service'

const STARRED = 'Starred'
const STARRED_EXCLUDED = new Set(['Trash', 'Junk', 'Drafts'])

// Mirrors the IMAP provider: flagged mail that already sits in Trash, Junk or
// Drafts is not something people keep "for later".
function isStarred(message: DemoMessage): boolean {
  return message.flags.includes('\\Flagged') && !STARRED_EXCLUDED.has(message.mailbox)
}

function toSummary(message: DemoMessage): MessageSummaryDto {
  return {
    uid: message.uid,
    subject: message.subject,
    from: message.from,
    to: message.to,
    date: message.date,
    flags: message.flags,
    unread: !message.flags.includes('\\Seen'),
    starred: message.flags.includes('\\Flagged'),
    hasAttachments: message.attachments.some((item) => !item.inline),
    mailbox: message.mailbox,
    preview: message.text.replace(/\s+/g, ' ').trim().slice(0, 180),
  }
}

/**
 * In-memory (persisted as JSON) mailbox used by the demo workspace. It mirrors the
 * behaviour of the IMAP provider closely enough for the UI to be explored offline.
 */
export class DemoProvider implements MailProvider {
  constructor(
    private readonly demo: DemoService,
    private readonly account: AccountRow,
  ) {}

  private get store() {
    return this.demo.getStore(this.account.user_id)
  }

  private save(): void {
    this.demo.persist(this.account.user_id)
  }

  async listMailboxes(): Promise<MailboxDto[]> {
    const messages = this.store.messages
    return this.store.folders.map((folder) => {
      const items =
        folder.path === STARRED
          ? messages.filter((message) => isStarred(message))
          : messages.filter((message) => message.mailbox === folder.path)
      return {
        path: folder.path,
        name: folder.name,
        delimiter: '/',
        specialUse: folder.specialUse,
        total: items.length,
        unread: items.filter((message) => !message.flags.includes('\\Seen')).length,
      }
    })
  }

  async listMessages(options: ListMessagesOptions): Promise<MessagePageDto> {
    const query = options.query?.trim().toLowerCase()
    const starred = options.mailbox === STARRED || options.mailbox === STARRED_MAILBOX
    const items = this.store.messages
      .filter((message) => (starred ? isStarred(message) : message.mailbox === options.mailbox))
      .filter((message) => {
        if (!query) return true
        const haystack = [
          message.subject,
          message.text,
          ...message.from.map((item) => `${item.name ?? ''} ${item.address}`),
          ...message.to.map((item) => `${item.name ?? ''} ${item.address}`),
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(query)
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const total = items.length
    const start = (options.page - 1) * options.pageSize
    return {
      mailbox: options.mailbox,
      messages: items.slice(start, start + options.pageSize).map(toSummary),
      total,
      page: options.page,
      pageSize: options.pageSize,
    }
  }

  async getMessage(_mailbox: string, uid: number): Promise<MessageDetailDto> {
    const message = this.find(uid)
    const inlineImages = new Map<string, string>()
    for (const attachment of message.attachments) {
      if (!attachment.cid || !attachment.contentType.startsWith('image/')) continue
      const content = Buffer.from(attachment.content, 'base64')
      if (content.byteLength > 1024 * 1024) continue
      inlineImages.set(
        attachment.cid.replace(/^<|>$/g, ''),
        `data:${attachment.contentType};base64,${attachment.content}`,
      )
    }
    return {
      ...toSummary(message),
      mailbox: message.mailbox,
      cc: message.cc,
      bcc: message.bcc,
      replyTo: message.replyTo,
      text: message.text,
      html: message.html ? sanitizeEmailHtml(message.html, inlineImages) : null,
      attachments: message.attachments.map((item, index) => ({
        index,
        filename: item.filename,
        contentType: item.contentType,
        size: Buffer.from(item.content, 'base64').byteLength,
        inline: item.inline === true,
      })),
      messageId: message.messageId,
      inReplyTo: message.inReplyTo,
      references: message.references,
    }
  }

  async getAttachment(_mailbox: string, uid: number, index: number): Promise<AttachmentPayload> {
    const message = this.find(uid)
    const attachment = message.attachments[index]
    if (!attachment) throw new Error('附件不存在')
    // The demo workspace keeps its mail in JSON, so there is no file to stream.
    const content = Buffer.from(attachment.content, 'base64')
    return {
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: content.byteLength,
      path: null,
      content,
    }
  }

  async setFlags(_mailbox: string, uid: number, flags: FlagUpdate): Promise<void> {
    const message = this.find(uid)
    const next = new Set(message.flags)
    if (flags.seen === true) next.add('\\Seen')
    if (flags.seen === false) next.delete('\\Seen')
    if (flags.flagged === true) next.add('\\Flagged')
    if (flags.flagged === false) next.delete('\\Flagged')
    message.flags = [...next]
    this.save()
  }

  async setFlagsMany(_mailbox: string, uids: number[], flags: FlagUpdate): Promise<void> {
    const messages = this.findMany(uids)
    for (const message of messages) {
      const next = new Set(message.flags)
      if (flags.seen === true) next.add('\\Seen')
      if (flags.seen === false) next.delete('\\Seen')
      if (flags.flagged === true) next.add('\\Flagged')
      if (flags.flagged === false) next.delete('\\Flagged')
      message.flags = [...next]
    }
    if (messages.length > 0) this.save()
  }

  async markMailboxRead(mailbox: string): Promise<void> {
    const starred = mailbox === STARRED || mailbox === STARRED_MAILBOX
    let changed = false
    for (const message of this.store.messages) {
      const matches = starred ? isStarred(message) : message.mailbox === mailbox
      if (!matches || message.flags.includes('\\Seen')) continue
      message.flags = [...message.flags, '\\Seen']
      changed = true
    }
    if (changed) this.save()
  }

  async move(_mailbox: string, uid: number, destination: string): Promise<MoveOutcome> {
    const message = this.find(uid)
    message.mailbox = destination
    message.flags = message.flags.filter((flag) => flag !== '\\Deleted')
    this.save()
    // Demo messages keep their UID across folders, so the mapping is the identity.
    return { movedTo: destination, uidMap: [{ from: uid, to: uid }] }
  }

  async moveMany(_mailbox: string, uids: number[], destination: string): Promise<MoveOutcome> {
    const messages = this.findMany(uids)
    for (const message of messages) {
      message.mailbox = destination
      message.flags = message.flags.filter((flag) => flag !== '\\Deleted')
    }
    if (messages.length > 0) this.save()
    return {
      movedTo: destination,
      uidMap: messages.map((message) => ({ from: message.uid, to: message.uid })),
    }
  }

  async saveDraft(draft: DraftPayload): Promise<SavedDraft | null> {
    const store = this.store
    const uid = store.nextUid++
    store.messages.push({
      uid,
      mailbox: 'Drafts',
      subject: draft.subject || '(无主题)',
      from: [{ name: this.account.name, address: this.account.email }],
      to: parseAddresses(draft.to),
      cc: parseAddresses(draft.cc),
      bcc: parseAddresses(draft.bcc),
      replyTo: [],
      date: new Date().toISOString(),
      flags: ['\\Draft'],
      text: draft.text ?? '',
      html: draft.html ?? null,
      attachments: [],
      messageId: `<${randomUUID()}@opensimplemail.local>`,
      inReplyTo: draft.inReplyTo ?? null,
      references: draft.references ?? [],
    })
    this.save()
    return { mailbox: 'Drafts', uid }
  }

  async removeDraft(mailbox: string, uid: number): Promise<void> {
    const store = this.store
    const next = store.messages.filter(
      (message) => !(message.uid === uid && message.mailbox === mailbox),
    )
    if (next.length === store.messages.length) return
    store.messages = next
    this.save()
  }

  async delete(_mailbox: string, uid: number): Promise<DeleteResult> {
    const message = this.find(uid)
    if (message.mailbox === 'Trash') {
      const store = this.store
      store.messages = store.messages.filter((item) => item.uid !== uid)
      this.save()
      return {}
    }
    message.mailbox = 'Trash'
    message.flags = message.flags.filter((flag) => flag !== '\\Deleted')
    this.save()
    return { movedTo: 'Trash', uidMap: [{ from: uid, to: uid }] }
  }

  async deleteMany(mailbox: string, uids: number[]): Promise<DeleteResult> {
    const set = new Set(uids)
    if (mailbox === 'Trash') {
      const store = this.store
      store.messages = store.messages.filter((item) => !set.has(item.uid))
      this.save()
      return {}
    }
    const moved = this.findMany(uids)
    for (const message of moved) {
      message.mailbox = 'Trash'
      message.flags = message.flags.filter((flag) => flag !== '\\Deleted')
    }
    this.save()
    return {
      movedTo: 'Trash',
      uidMap: moved.map((message) => ({ from: message.uid, to: message.uid })),
    }
  }

  async createMailbox(path: string): Promise<void> {
    const trimmed = path.trim()
    if (!trimmed) throw new Error('文件夹名不能为空')
    if (this.store.folders.some((folder) => folder.path === trimmed)) {
      throw new Error('文件夹已存在')
    }
    this.store.folders.push({
      path: trimmed,
      name: trimmed.split('/').pop() || trimmed,
      specialUse: '',
    })
    this.save()
  }

  async renameMailbox(path: string, newPath: string): Promise<void> {
    const trimmed = newPath.trim()
    const folder = this.store.folders.find((item) => item.path === path)
    if (!folder) throw new Error('文件夹不存在')
    if (this.store.folders.some((item) => item.path === trimmed)) {
      throw new Error('目标文件夹已存在')
    }
    folder.path = trimmed
    folder.name = trimmed.split('/').pop() || trimmed
    for (const message of this.store.messages) {
      if (message.mailbox === path) message.mailbox = trimmed
    }
    this.save()
  }

  async deleteMailbox(path: string): Promise<void> {
    this.store.folders = this.store.folders.filter((folder) => folder.path !== path)
    this.store.messages = this.store.messages.filter((message) => message.mailbox !== path)
    this.save()
  }

  async emptyMailbox(path: string): Promise<void> {
    this.store.messages = this.store.messages.filter((message) => message.mailbox !== path)
    this.save()
  }

  async send(message: OutgoingMessage): Promise<SendResultDto> {
    const store = this.store
    const uid = store.nextUid++
    const now = new Date().toISOString()
    const messageId = `<${randomUUID()}@opensimplemail.local>`
    // Uploads live on disk now, so read them once to seed the demo store.
    const attachments = await Promise.all(
      message.attachments.map(async (item) => ({
        filename: item.filename,
        contentType: item.contentType,
        content: (await readFile(item.path)).toString('base64'),
      })),
    )
    const sent: DemoMessage = {
      uid,
      mailbox: 'Sent',
      subject: message.subject,
      from: [{ name: this.account.name, address: this.account.email }],
      to: parseAddresses(message.to),
      cc: parseAddresses(message.cc),
      bcc: parseAddresses(message.bcc),
      replyTo: [],
      date: now,
      flags: ['\\Seen'],
      text: message.text ?? '',
      html: message.html ?? null,
      attachments,
      messageId,
      inReplyTo: message.inReplyTo ?? null,
      references: message.references ?? [],
    }
    store.messages.push(sent)
    this.save()
    return {
      messageId,
      accepted: [message.to, message.cc, message.bcc]
        .filter(Boolean)
        .flatMap((value) => parseAddresses(value).map((item) => item.address)),
    }
  }

  async test(): Promise<TestResultDto> {
    return { imap: 'ok', smtp: 'ok', durationMs: 0 }
  }

  private find(uid: number): DemoMessage {
    const message = this.store.messages.find((item) => item.uid === uid)
    if (!message) throw new Error('邮件不存在或已被删除')
    return message
  }

  private findMany(uids: number[]): DemoMessage[] {
    const set = new Set(uids)
    return this.store.messages.filter((item) => set.has(item.uid))
  }
}

function parseAddresses(value: string | undefined): { name: string | null; address: string }[] {
  if (!value) return []
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*?)\s*<([^>]+)>$/)
      if (match) {
        const name = match[1].replace(/^["']|["']$/g, '').trim()
        return { name: name || null, address: match[2].trim() }
      }
      return { name: null, address: part }
    })
}
