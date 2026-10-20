import { Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import type {
  AddressDto,
  MailboxDto,
  MessageDetailDto,
  MessagePageDto,
  MessageSummaryDto,
  SendResultDto,
  TestResultDto,
} from '@osm/shared'
import type { FetchMessageObject, ImapFlow, MessageStructureObject } from 'imapflow'
import { type AddressObject, type ParsedMail, simpleParser } from 'mailparser'
import type { ImapPool } from './imap.pool'
import type {
  AttachmentPayload,
  DeleteResult,
  FlagUpdate,
  ListMessagesOptions,
  MailCredentials,
  MailProvider,
  OutgoingMessage,
} from './mail.types'
import { sanitizeEmailHtml } from './message-sanitizer'
import type { SmtpService } from './smtp.service'

const MAX_MESSAGE_BYTES = 40 * 1024 * 1024
const INLINE_IMAGE_LIMIT = 1024 * 1024

function toIso(value: Date | string | undefined): string {
  if (!value) return new Date().toISOString()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function mapAddresses(value: { name?: string; address?: string }[] | undefined): AddressDto[] {
  return (value ?? [])
    .filter((item) => Boolean(item.address))
    .map((item) => ({ name: item.name?.trim() || null, address: item.address as string }))
}

function hasAttachments(node: MessageStructureObject | undefined): boolean {
  if (!node) return false
  if (node.disposition === 'attachment') return true
  const filename = node.dispositionParameters?.filename ?? node.parameters?.name
  if (filename && node.disposition !== 'inline') return true
  return (node.childNodes ?? []).some(hasAttachments)
}

function toSummary(message: FetchMessageObject): MessageSummaryDto {
  const flags = [...(message.flags ?? [])]
  return {
    uid: message.uid,
    subject: message.envelope?.subject ?? '',
    from: mapAddresses(message.envelope?.from),
    to: mapAddresses(message.envelope?.to),
    date: toIso(message.internalDate ?? message.envelope?.date),
    flags,
    unread: !flags.includes('\\Seen'),
    starred: flags.includes('\\Flagged'),
    hasAttachments: hasAttachments(message.bodyStructure),
    size: message.size,
  }
}

function mapParsedAddresses(value: AddressObject | AddressObject[] | undefined): AddressDto[] {
  if (!value) return []
  const list: AddressObject[] = Array.isArray(value) ? value : [value]
  return list.flatMap((entry) =>
    entry.value
      .filter((item) => Boolean(item.address))
      .map((item) => ({ name: item.name?.trim() || null, address: item.address as string })),
  )
}

function referencesOf(value: string[] | string | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Thin IMAP adapter. All commands for one account are serialized through ImapPool,
 * because an IMAP connection can only have one selected mailbox at a time.
 */
export class ImapProvider implements MailProvider {
  private readonly logger = new Logger(ImapProvider.name)

  constructor(
    private readonly pool: ImapPool,
    private readonly smtp: SmtpService,
    private readonly creds: MailCredentials,
  ) {}

  async listMailboxes(): Promise<MailboxDto[]> {
    return this.pool.withClient(this.creds, async (client) => {
      let list: Awaited<ReturnType<typeof client.list>>
      try {
        list = await client.list({ statusQuery: { messages: true, unseen: true } })
      } catch {
        // Older servers reject STATUS in LIST; fall back to plain LIST + STATUS below.
        list = await client.list()
      }
      const result: MailboxDto[] = []
      for (const item of list) {
        if (!item.listed || item.flags.has('\\Noselect')) continue
        let total = item.status?.messages ?? 0
        let unread = item.status?.unseen ?? 0
        if (!item.status) {
          try {
            const status = await client.status(item.path, { messages: true, unseen: true })
            if (status) {
              total = status.messages ?? 0
              unread = status.unseen ?? 0
            }
          } catch {
            // Some servers refuse STATUS on \Noselect-like folders; show it empty.
          }
        }
        result.push({
          path: item.path,
          name: item.name,
          delimiter: item.delimiter,
          specialUse: item.specialUse ?? null,
          total,
          unread,
        })
      }
      return result
    })
  }

  async listMessages(options: ListMessagesOptions): Promise<MessagePageDto> {
    const query = options.query?.trim()
    return this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(options.mailbox)
      try {
        const fetchQuery = {
          envelope: true,
          flags: true,
          uid: true,
          bodyStructure: true,
          internalDate: true,
          size: true,
        }
        const emptyPage = (total: number) => ({
          mailbox: options.mailbox,
          messages: [],
          total,
          page: options.page,
          pageSize: options.pageSize,
        })

        if (query) {
          const found = await client.search(
            {
              or: [{ subject: query }, { from: query }, { to: query }, { text: query }],
            },
            { uid: true },
          )
          const uids = Array.isArray(found) ? [...found].sort((a, b) => b - a) : []
          const start = (options.page - 1) * options.pageSize
          const pageUids = uids.slice(start, start + options.pageSize)
          if (pageUids.length === 0) return emptyPage(uids.length)
          return {
            mailbox: options.mailbox,
            messages: await this.fetchSummaries(client, pageUids),
            total: uids.length,
            page: options.page,
            pageSize: options.pageSize,
          }
        }

        const mailbox = client.mailbox
        const total = mailbox ? mailbox.exists : 0
        const end = total - (options.page - 1) * options.pageSize
        const start = Math.max(1, end - options.pageSize + 1)
        if (end < 1) return emptyPage(total)

        const messages: MessageSummaryDto[] = []
        for await (const message of client.fetch(`${start}:${end}`, fetchQuery)) {
          messages.push(toSummary(message))
        }
        messages.sort((a, b) => b.uid - a.uid)
        return {
          mailbox: options.mailbox,
          messages,
          total,
          page: options.page,
          pageSize: options.pageSize,
        }
      } finally {
        lock.release()
      }
    })
  }

  async getMessage(mailbox: string, uid: number): Promise<MessageDetailDto> {
    return this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        const message = await client.fetchOne(
          uid,
          {
            envelope: true,
            flags: true,
            uid: true,
            source: true,
            internalDate: true,
            bodyStructure: true,
            size: true,
          },
          { uid: true },
        )
        // biome-ignore lint/complexity/useOptionalChain: optional chaining would not narrow the `false` branch of fetchOne
        if (!message || !message.source) {
          throw new NotFoundException('邮件不存在或已被删除')
        }
        if (message.size && message.size > MAX_MESSAGE_BYTES) {
          throw new PayloadTooLargeException('邮件超过 40 MB，暂不支持在线查看')
        }
        const parsed = await simpleParser(message.source)
        return this.buildDetail(message, parsed, mailbox)
      } finally {
        lock.release()
      }
    })
  }

  async getAttachment(mailbox: string, uid: number, index: number): Promise<AttachmentPayload> {
    return this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        const message = await client.fetchOne(uid, { source: true, size: true }, { uid: true })
        // biome-ignore lint/complexity/useOptionalChain: optional chaining would not narrow the `false` branch of fetchOne
        if (!message || !message.source) throw new NotFoundException('邮件不存在或已被删除')
        const parsed = await simpleParser(message.source)
        const attachment = parsed.attachments[index]
        if (!attachment) throw new NotFoundException('附件不存在')
        return {
          filename: attachment.filename ?? `attachment-${index + 1}`,
          contentType: attachment.contentType || 'application/octet-stream',
          content: attachment.content,
        }
      } finally {
        lock.release()
      }
    })
  }

  async setFlags(mailbox: string, uid: number, flags: FlagUpdate): Promise<void> {
    await this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        if (flags.seen === true) await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
        if (flags.seen === false) await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true })
        if (flags.flagged === true) await client.messageFlagsAdd(uid, ['\\Flagged'], { uid: true })
        if (flags.flagged === false)
          await client.messageFlagsRemove(uid, ['\\Flagged'], { uid: true })
      } finally {
        lock.release()
      }
    })
  }

  async move(mailbox: string, uid: number, destination: string): Promise<void> {
    await this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        await client.messageMove(uid, destination, { uid: true })
      } finally {
        lock.release()
      }
    })
  }

  async delete(mailbox: string, uid: number): Promise<DeleteResult> {
    return this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        const list = await client.list()
        const trash = list.find(
          (item) =>
            item.specialUse === '\\Trash' ||
            /^(trash|deleted items|已删除|废纸篓)$/i.test(item.name),
        )
        if (trash && trash.path !== mailbox) {
          await client.messageMove(uid, trash.path, { uid: true })
          return { movedTo: trash.path }
        }
        await client.messageDelete(uid, { uid: true })
        return {}
      } finally {
        lock.release()
      }
    })
  }

  async send(message: OutgoingMessage): Promise<SendResultDto> {
    const sent = await this.smtp.send(this.creds, message)

    try {
      await this.pool.withClient(this.creds, async (client) => {
        const list = await client.list()
        const sentBox = list.find(
          (item) => item.specialUse === '\\Sent' || /^(sent|sent items|已发送)$/i.test(item.name),
        )
        if (sentBox) {
          await client.append(sentBox.path, sent.raw, ['\\Seen'])
        }
      })
    } catch (error) {
      // The message was delivered; failing to file a copy must not fail the request.
      this.logger.warn(`Could not append sent message to Sent folder: ${String(error)}`)
    }

    return { messageId: sent.messageId, accepted: sent.accepted }
  }

  async test(): Promise<TestResultDto> {
    const started = Date.now()
    await this.pool.verify(this.creds)
    await this.smtp.verify(this.creds)
    return { imap: 'ok', smtp: 'ok', durationMs: Date.now() - started }
  }

  private async fetchSummaries(client: ImapFlow, uids: number[]): Promise<MessageSummaryDto[]> {
    const result: MessageSummaryDto[] = []
    for await (const message of client.fetch(uids, {
      envelope: true,
      flags: true,
      uid: true,
      bodyStructure: true,
      internalDate: true,
      size: true,
    })) {
      result.push(toSummary(message))
    }
    result.sort((a, b) => b.uid - a.uid)
    return result
  }

  private buildDetail(
    message: FetchMessageObject,
    parsed: ParsedMail,
    mailbox: string,
  ): MessageDetailDto {
    const summary = toSummary(message)
    const inlineImages = new Map<string, string>()
    for (const attachment of parsed.attachments) {
      if (!attachment.cid || !attachment.contentType.startsWith('image/')) continue
      if (attachment.content.byteLength > INLINE_IMAGE_LIMIT) continue
      const cid = attachment.cid.replace(/^<|>$/g, '')
      inlineImages.set(
        cid,
        `data:${attachment.contentType};base64,${attachment.content.toString('base64')}`,
      )
    }

    return {
      ...summary,
      subject: parsed.subject ?? summary.subject,
      from: parsed.from ? mapParsedAddresses(parsed.from) : summary.from,
      to: parsed.to ? mapParsedAddresses(parsed.to) : summary.to,
      cc: mapParsedAddresses(parsed.cc),
      bcc: mapParsedAddresses(parsed.bcc),
      replyTo: mapParsedAddresses(parsed.replyTo),
      date: toIso(parsed.date ?? summary.date),
      mailbox,
      text: parsed.text ?? null,
      html: parsed.html ? sanitizeEmailHtml(parsed.html, inlineImages) : null,
      attachments: parsed.attachments.map((attachment, index) => ({
        index,
        filename: attachment.filename ?? `attachment-${index + 1}`,
        contentType: attachment.contentType || 'application/octet-stream',
        size: attachment.size,
        inline: Boolean(attachment.cid) || attachment.related === true,
      })),
      messageId: parsed.messageId ?? null,
      inReplyTo: parsed.inReplyTo ?? null,
      references: referencesOf(parsed.references),
    }
  }
}
