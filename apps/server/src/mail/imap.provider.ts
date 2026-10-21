import { readFile } from 'node:fs/promises'
import { Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import {
  type AddressDto,
  type MailboxDto,
  type MessageDetailDto,
  type MessagePageDto,
  type MessageSummaryDto,
  type SendResultDto,
  STARRED_MAILBOX,
  type TestResultDto,
} from '@osm/shared'
import type { FetchMessageObject, ImapFlow, MessageStructureObject } from 'imapflow'
import type { AddressObject } from 'mailparser'
import type { AttachmentStorage } from './attachment-storage'
import type { ImapPool } from './imap.pool'
import type {
  AttachmentPayload,
  DeleteResult,
  FlagUpdate,
  ListMessagesOptions,
  MailCredentials,
  MailProvider,
  MoveOutcome,
  OutgoingMessage,
} from './mail.types'
import {
  MessageTooLargeError,
  type ParsedMessage,
  parseMessage as parseMessageStream,
} from './message-parser'
import { sanitizeEmailHtml } from './message-sanitizer'
import { type ParsedMessageCache, parsedCacheKey } from './parsed-cache'
import { previewFromSource } from './preview'
import type { SmtpService } from './smtp.service'

const MAX_MESSAGE_BYTES = 40 * 1024 * 1024
// Inline images are embedded into the HTML as data URLs, so they do land in
// memory. Cap the total instead of letting a photo-heavy newsletter balloon.
const INLINE_IMAGE_TOTAL_LIMIT = 12 * 1024 * 1024

// Folder counts are only a sidebar hint and change slowly. Cache them briefly
// so polling and several mounted components do not re-run a STATUS per folder.
const MAILBOX_CACHE_TTL_MS = 45 * 1000
const MAILBOX_CACHE_MAX_ENTRIES = 50
const MAILBOX_STATUS_CONCURRENCY = 4

interface MailboxCacheEntry {
  mailboxes: MailboxDto[]
  storedAt: number
}

const mailboxCache = new Map<string, MailboxCacheEntry>()

function readMailboxCache(accountId: string): MailboxDto[] | null {
  const entry = mailboxCache.get(accountId)
  if (!entry) return null
  if (Date.now() - entry.storedAt > MAILBOX_CACHE_TTL_MS) {
    mailboxCache.delete(accountId)
    return null
  }
  return entry.mailboxes.map((mailbox) => ({ ...mailbox }))
}

function writeMailboxCache(accountId: string, mailboxes: MailboxDto[]): void {
  mailboxCache.delete(accountId)
  while (mailboxCache.size >= MAILBOX_CACHE_MAX_ENTRIES) {
    const oldest = mailboxCache.keys().next().value as string | undefined
    if (!oldest) break
    mailboxCache.delete(oldest)
  }
  mailboxCache.set(accountId, { mailboxes, storedAt: Date.now() })
}

function dropMailboxCache(accountId: string): void {
  mailboxCache.delete(accountId)
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (true) {
      const index = next
      next += 1
      if (index >= items.length) return
      results[index] = await fn(items[index] as T)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// The starred view merges SEARCH results from several folders. Cache the
// merged summaries briefly so pagination and auto-refresh do not re-run a
// search against every folder on each keystroke.
const STARRED_CACHE_TTL_MS = 2 * 60 * 1000
const STARRED_CACHE_MAX_ENTRIES = 24
const STARRED_MAX_PER_FOLDER = 200
const STARRED_MAX_TOTAL = 500

interface StarredCacheEntry {
  messages: MessageSummaryDto[]
  storedAt: number
}

const starredCache = new Map<string, StarredCacheEntry>()

function dropStarredCache(accountId: string): void {
  for (const key of starredCache.keys()) {
    if (key.startsWith(`${accountId}\u0000`)) starredCache.delete(key)
  }
}

function readStarredCache(accountId: string, query: string): MessageSummaryDto[] | null {
  const key = `${accountId}\u0000${query}`
  const entry = starredCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.storedAt > STARRED_CACHE_TTL_MS) {
    starredCache.delete(key)
    return null
  }
  return entry.messages
}

function writeStarredCache(accountId: string, query: string, messages: MessageSummaryDto[]): void {
  const key = `${accountId}\u0000${query}`
  starredCache.delete(key)
  while (starredCache.size >= STARRED_CACHE_MAX_ENTRIES) {
    const oldest = starredCache.keys().next().value as string | undefined
    if (!oldest) break
    starredCache.delete(oldest)
  }
  starredCache.set(key, { messages, storedAt: Date.now() })
}

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

function toSummary(
  message: FetchMessageObject,
  mailbox?: string,
  includePreview = true,
): MessageSummaryDto {
  const flags = [...(message.flags ?? [])]
  const preview = includePreview && message.source ? previewFromSource(message.source) : ''
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
    mailbox,
    ...(preview ? { preview } : {}),
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

/** Convert ImapFlow's COPYUID map into the wire shape the client can undo with. */
function uidPairs(result: { uidMap?: Map<number, number> } | false): MoveOutcome['uidMap'] {
  if (!result || !result.uidMap || result.uidMap.size === 0) return undefined
  return [...result.uidMap].map(([from, to]) => ({ from, to }))
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
    private readonly storage: AttachmentStorage,
    private readonly cache: ParsedMessageCache,
  ) {}

  async listMailboxes(): Promise<MailboxDto[]> {
    const cached = readMailboxCache(this.creds.accountId)
    if (cached) return cached

    const result = await this.pool.withClient(this.creds, async (client) => {
      // Plain LIST + per-folder STATUS is more portable than LIST-STATUS. Some
      // providers (notably QQ Mail) close the connection on the extended form.
      const list = await client.list()
      const items = list.filter((item) => item.listed && !item.flags.has('\\Noselect'))

      // A few STATUS commands are pipelined at a time instead of one full
      // round-trip per folder; failures stay isolated to their folder.
      const counts = await mapWithConcurrency(
        items,
        MAILBOX_STATUS_CONCURRENCY,
        async (item): Promise<{ total: number; unread: number }> => {
          try {
            const status = await client.status(item.path, { messages: true, unseen: true })
            if (!status) return { total: 0, unread: 0 }
            return { total: status.messages ?? 0, unread: status.unseen ?? 0 }
          } catch {
            // Some servers refuse STATUS on special folders; show them as empty.
            return { total: 0, unread: 0 }
          }
        },
      )

      return items.map((item, index) => ({
        path: item.path,
        name: item.name,
        delimiter: item.delimiter,
        specialUse: item.specialUse ?? null,
        total: counts[index]?.total ?? 0,
        unread: counts[index]?.unread ?? 0,
      }))
    })

    writeMailboxCache(this.creds.accountId, result)
    return result
  }

  async listMessages(options: ListMessagesOptions): Promise<MessagePageDto> {
    if (options.mailbox === STARRED_MAILBOX) return this.listStarred(options)
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
          // Enough of the source for a two-line preview without downloading
          // whole messages just to render the list.
          source: { start: 0, maxLength: 4096 },
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
            messages: await this.fetchSummaries(client, pageUids, options.mailbox),
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
          messages.push(toSummary(message, options.mailbox))
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

  /**
   * Aggregate flagged messages for the virtual starred mailbox. Servers that
   * expose a `\Flagged` folder (Gmail's Starred, for example) already do the
   * aggregation, so a single SEARCH is enough; everyone else is searched
   * folder by folder. Trash, Junk, Drafts and `\All` are skipped: the first
   * three are not where people keep things for later, and `\All` would
   * duplicate every hit from the folders already visited.
   */
  private async listStarred(options: ListMessagesOptions): Promise<MessagePageDto> {
    const query = options.query?.trim() ?? ''
    const cached = readStarredCache(this.creds.accountId, query)
    const messages = cached ?? (await this.collectStarred(query))
    if (!cached) writeStarredCache(this.creds.accountId, query, messages)

    const start = (options.page - 1) * options.pageSize
    return {
      mailbox: STARRED_MAILBOX,
      messages: messages.slice(start, start + options.pageSize),
      total: messages.length,
      page: options.page,
      pageSize: options.pageSize,
    }
  }

  private async collectStarred(query: string): Promise<MessageSummaryDto[]> {
    const criteria = {
      flagged: true,
      ...(query
        ? { or: [{ subject: query }, { from: query }, { to: query }, { text: query }] }
        : {}),
    }

    return this.pool.withClient(this.creds, async (client) => {
      const list = await client.list()
      const selectable = list.filter((item) => item.listed && !item.flags.has('\\Noselect'))
      const flagged = selectable.find((item) => item.specialUse === '\\Flagged')
      const targets = flagged
        ? [flagged]
        : selectable.filter(
            (item) =>
              !['\\Trash', '\\Junk', '\\Drafts', '\\All'].includes(item.specialUse ?? '') &&
              item.specialUse !== '\\Flagged',
          )

      const collected: MessageSummaryDto[] = []
      for (const folder of targets) {
        try {
          const lock = await client.getMailboxLock(folder.path)
          try {
            const found = await client.search(criteria, { uid: true })
            // Keep the newest hits; a folder with years of flagged mail must not
            // make the starred view download thousands of envelopes.
            const uids = Array.isArray(found) ? found.slice(-STARRED_MAX_PER_FOLDER) : []
            if (uids.length === 0) continue
            collected.push(...(await this.fetchSummaries(client, uids, folder.path)))
          } finally {
            lock.release()
          }
        } catch (error) {
          this.logger.warn(`Could not search ${folder.path} for starred messages: ${String(error)}`)
        }
      }

      return collected
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, STARRED_MAX_TOTAL)
    })
  }

  async getMessage(mailbox: string, uid: number): Promise<MessageDetailDto> {
    const cacheKey = parsedCacheKey(this.creds.accountId, mailbox, uid)
    const cached = this.cache.get(cacheKey)
    return this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        // The body comes from the cache when it is warm: only the envelope,
        // flags and size are fetched, never the source again.
        const message = await client.fetchOne(
          uid,
          {
            envelope: true,
            flags: true,
            uid: true,
            internalDate: true,
            bodyStructure: true,
            size: true,
          },
          { uid: true },
        )
        if (!message) throw new NotFoundException('邮件不存在或已被删除')
        if (message.size && message.size > MAX_MESSAGE_BYTES) {
          throw new PayloadTooLargeException('邮件超过 40 MB，暂不支持在线查看')
        }

        const parsed = cached ?? (await this.parseFromServer(client, mailbox, uid))
        return await this.buildDetail(message, parsed, mailbox)
      } finally {
        lock.release()
      }
    })
  }

  async getAttachment(mailbox: string, uid: number, index: number): Promise<AttachmentPayload> {
    const cacheKey = parsedCacheKey(this.creds.accountId, mailbox, uid)
    const cached = this.cache.get(cacheKey)
    if (cached) return this.attachmentPayload(cached, index)

    return this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        const parsed = await this.parseFromServer(client, mailbox, uid)
        return this.attachmentPayload(parsed, index)
      } finally {
        lock.release()
      }
    })
  }

  /**
   * Streams the raw message from the server and extracts every attachment to
   * disk. Nothing larger than a chunk of the MIME stream is held in memory.
   */
  private async parseFromServer(
    client: ImapFlow,
    mailbox: string,
    uid: number,
  ): Promise<ParsedMessage> {
    const cacheKey = parsedCacheKey(this.creds.accountId, mailbox, uid)
    return this.cache.load(cacheKey, async () => {
      await this.storage.prepare()
      const directory = this.storage.cacheDir(this.creds.accountId, mailbox, uid)
      const download = await client.download(uid, undefined, { uid: true })
      if (!download.content) throw new NotFoundException('邮件不存在或已被删除')

      try {
        // `load` stores the result itself, unless the cache was purged meanwhile.
        return await parseMessageStream(download.content, {
          dir: directory,
          maxBytes: MAX_MESSAGE_BYTES,
        })
      } catch (error) {
        await this.storage.remove(directory)
        if (error instanceof MessageTooLargeError) {
          throw new PayloadTooLargeException('邮件超过 40 MB，暂不支持在线查看')
        }
        throw error
      }
    })
  }

  private attachmentPayload(parsed: ParsedMessage, index: number): AttachmentPayload {
    const attachment = parsed.attachments[index]
    if (!attachment) throw new NotFoundException('附件不存在')
    return {
      filename: attachment.filename ?? `attachment-${index + 1}`,
      contentType: attachment.contentType || 'application/octet-stream',
      size: attachment.size,
      path: attachment.path,
      content: null,
    }
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
    if (flags.flagged !== undefined) dropStarredCache(this.creds.accountId)
    if (flags.seen !== undefined) dropMailboxCache(this.creds.accountId)
  }

  async setFlagsMany(mailbox: string, uids: number[], flags: FlagUpdate): Promise<void> {
    if (uids.length === 0) return
    await this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        if (flags.seen === true) await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true })
        if (flags.seen === false) await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true })
        if (flags.flagged === true) await client.messageFlagsAdd(uids, ['\\Flagged'], { uid: true })
        if (flags.flagged === false)
          await client.messageFlagsRemove(uids, ['\\Flagged'], { uid: true })
      } finally {
        lock.release()
      }
    })
    if (flags.flagged !== undefined) dropStarredCache(this.creds.accountId)
    if (flags.seen !== undefined) dropMailboxCache(this.creds.accountId)
  }

  async markMailboxRead(mailbox: string): Promise<void> {
    await this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        // Sequence range: every message currently in the selected mailbox.
        if (client.mailbox && client.mailbox.exists > 0) {
          await client.messageFlagsAdd('1:*', ['\\Seen'])
        }
      } finally {
        lock.release()
      }
    })
    dropMailboxCache(this.creds.accountId)
    dropStarredCache(this.creds.accountId)
  }

  async move(mailbox: string, uid: number, destination: string): Promise<MoveOutcome> {
    const result = await this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        return await client.messageMove(uid, destination, { uid: true })
      } finally {
        lock.release()
      }
    })
    this.cache.drop(parsedCacheKey(this.creds.accountId, mailbox, uid))
    dropStarredCache(this.creds.accountId)
    dropMailboxCache(this.creds.accountId)
    return { movedTo: destination, uidMap: uidPairs(result) }
  }

  async moveMany(mailbox: string, uids: number[], destination: string): Promise<MoveOutcome> {
    if (uids.length === 0) return {}
    const result = await this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        return await client.messageMove(uids, destination, { uid: true })
      } finally {
        lock.release()
      }
    })
    for (const uid of uids) this.cache.drop(parsedCacheKey(this.creds.accountId, mailbox, uid))
    dropStarredCache(this.creds.accountId)
    dropMailboxCache(this.creds.accountId)
    return { movedTo: destination, uidMap: uidPairs(result) }
  }

  async delete(mailbox: string, uid: number): Promise<DeleteResult> {
    const result = await this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        const list = await client.list()
        const trash = list.find(
          (item) =>
            item.specialUse === '\\Trash' ||
            /^(trash|deleted items|已删除|废纸篓)$/i.test(item.name),
        )
        if (trash && trash.path !== mailbox) {
          const moved = await client.messageMove(uid, trash.path, { uid: true })
          return { movedTo: trash.path, uidMap: uidPairs(moved) }
        }
        await client.messageDelete(uid, { uid: true })
        return {}
      } finally {
        lock.release()
      }
    })
    this.cache.drop(parsedCacheKey(this.creds.accountId, mailbox, uid))
    dropStarredCache(this.creds.accountId)
    dropMailboxCache(this.creds.accountId)
    return result
  }

  async deleteMany(mailbox: string, uids: number[]): Promise<DeleteResult> {
    if (uids.length === 0) return {}
    const result = await this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(mailbox)
      try {
        const list = await client.list()
        const trash = list.find(
          (item) =>
            item.specialUse === '\\Trash' ||
            /^(trash|deleted items|已删除|废纸篓)$/i.test(item.name),
        )
        if (trash && trash.path !== mailbox) {
          const moved = await client.messageMove(uids, trash.path, { uid: true })
          return { movedTo: trash.path, uidMap: uidPairs(moved) }
        }
        await client.messageDelete(uids, { uid: true })
        return {}
      } finally {
        lock.release()
      }
    })
    for (const uid of uids) this.cache.drop(parsedCacheKey(this.creds.accountId, mailbox, uid))
    dropStarredCache(this.creds.accountId)
    dropMailboxCache(this.creds.accountId)
    return result
  }

  async createMailbox(path: string): Promise<void> {
    await this.pool.withClient(this.creds, async (client) => {
      await client.mailboxCreate(path)
    })
    dropMailboxCache(this.creds.accountId)
  }

  async renameMailbox(path: string, newPath: string): Promise<void> {
    await this.pool.withClient(this.creds, async (client) => {
      await client.mailboxRename(path, newPath)
    })
    dropMailboxCache(this.creds.accountId)
    dropStarredCache(this.creds.accountId)
  }

  async deleteMailbox(path: string): Promise<void> {
    await this.pool.withClient(this.creds, async (client) => {
      await client.mailboxDelete(path)
    })
    dropMailboxCache(this.creds.accountId)
    dropStarredCache(this.creds.accountId)
  }

  async emptyMailbox(path: string): Promise<void> {
    await this.pool.withClient(this.creds, async (client) => {
      const lock = await client.getMailboxLock(path)
      try {
        if (client.mailbox && client.mailbox.exists > 0) {
          await client.messageDelete('1:*')
          // CLOSE expunges the messages that were just flagged as deleted.
          await client.mailboxClose()
        }
      } finally {
        lock.release()
      }
    })
    dropMailboxCache(this.creds.accountId)
    dropStarredCache(this.creds.accountId)
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
    dropMailboxCache(this.creds.accountId)

    return { messageId: sent.messageId, accepted: sent.accepted }
  }

  async test(): Promise<TestResultDto> {
    const started = Date.now()
    await this.pool.verify(this.creds)
    await this.smtp.verify(this.creds)
    return { imap: 'ok', smtp: 'ok', durationMs: Date.now() - started }
  }

  private async fetchSummaries(
    client: ImapFlow,
    uids: number[],
    mailbox?: string,
  ): Promise<MessageSummaryDto[]> {
    const result: MessageSummaryDto[] = []
    for await (const message of client.fetch(uids, {
      envelope: true,
      flags: true,
      uid: true,
      bodyStructure: true,
      internalDate: true,
      size: true,
      source: { start: 0, maxLength: 4096 },
    })) {
      result.push(toSummary(message, mailbox))
    }
    result.sort((a, b) => b.uid - a.uid)
    return result
  }

  private async buildDetail(
    message: FetchMessageObject,
    parsed: ParsedMessage,
    mailbox: string,
  ): Promise<MessageDetailDto> {
    const summary = toSummary(message, undefined, false)
    const inlineImages = await this.inlineImages(parsed)

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

  /**
   * `cid:` links only render when the bytes are inlined as data URLs. Read them
   * back from disk, bounded by a total budget so a photo-heavy newsletter does
   * not pull tens of megabytes into the response.
   */
  private async inlineImages(parsed: ParsedMessage): Promise<Map<string, string>> {
    const images = new Map<string, string>()
    let total = 0
    for (const attachment of parsed.attachments) {
      if (!attachment.cid || !attachment.path) continue
      if (!attachment.contentType.startsWith('image/')) continue
      if (total + attachment.size > INLINE_IMAGE_TOTAL_LIMIT) continue
      try {
        const content = await readFile(attachment.path)
        total += content.byteLength
        const cid = attachment.cid.replace(/^<|>$/g, '')
        images.set(cid, `data:${attachment.contentType};base64,${content.toString('base64')}`)
      } catch {
        // A cache file that disappeared mid-request only costs one inline image.
      }
    }
    return images
  }
}
