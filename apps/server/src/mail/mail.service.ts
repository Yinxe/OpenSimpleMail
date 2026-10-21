import { basename } from 'node:path'
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common'
import type {
  MailboxDto,
  MessageDetailDto,
  MessagePageDto,
  SendResultDto,
  UnifiedMessageDto,
  UnifiedMessagePageDto,
} from '@osm/shared'
import { AccountsService } from '../accounts/accounts.service'
import { ClamAvService } from '../common/clamav.service'
import { ContactsService } from '../contacts/contacts.service'
import { DemoService } from '../demo/demo.service'
import { AttachmentStorage } from './attachment-storage'
import { ImapPool } from './imap.pool'
import { ImapProvider, invalidateAccountCaches } from './imap.provider'
import type {
  AttachmentPayload,
  DraftPayload,
  FlagUpdate,
  MailProvider,
  MoveOutcome,
  OutgoingAttachment,
  OutgoingMessage,
  SavedDraft,
} from './mail.types'
import { ParsedMessageCache } from './parsed-cache'
import { SmtpService } from './smtp.service'

interface ParsedAddress {
  name: string | null
  address: string
}

/**
 * Lightweight recipient splitter for contact learning. It intentionally does
 * not try to be a full RFC 5322 parser: commas/semicolons separate entries and
 * an optional `Name <address>` wrapper is unwrapped.
 */
function splitAddressList(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (const char of value) {
    if (char === '"') quoted = !quoted
    if (!quoted && (char === ',' || char === ';')) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  parts.push(current)
  return parts
}

function parseAddressList(value: string | undefined): ParsedAddress[] {
  if (!value?.trim()) return []
  const result: ParsedAddress[] = []
  for (const part of splitAddressList(value)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^(.*?)<([^>]+)>$/)
    if (match) {
      const name = (match[1] ?? '').trim().replace(/^"|"$/g, '').trim()
      result.push({ name: name || null, address: (match[2] ?? '').trim() })
    } else {
      result.push({ name: null, address: trimmed.replace(/^"|"$/g, '').trim() })
    }
  }
  return result.filter((item) => item.address.includes('@'))
}

@Injectable()
export class MailService {
  /**
   * Short-lived cache of one account's list page, keyed by mailbox/query/size.
   * Paging the unified inbox walks pages 1..N per account, so without this a
   * deep page re-runs every earlier IMAP fetch; with it, page N reuses the
   * pages fetched for page N-1.
   */
  private readonly unifiedPages = new Map<string, { at: number; data: MessagePageDto }>()
  private static readonly UNIFIED_TTL_MS = 20_000
  private static readonly UNIFIED_MAX_ENTRIES = 400

  private readonly logger = new Logger(MailService.name)

  constructor(
    private readonly accounts: AccountsService,
    private readonly demo: DemoService,
    private readonly pool: ImapPool,
    private readonly smtp: SmtpService,
    private readonly contacts: ContactsService,
    private readonly storage: AttachmentStorage,
    private readonly cache: ParsedMessageCache,
    private readonly clamav: ClamAvService,
  ) {}

  async provider(userId: string, accountId: string): Promise<MailProvider> {
    const row = this.accounts.getRow(userId, accountId)
    if (row.kind === 'demo') return this.demo.providerFor(row)
    return new ImapProvider(
      this.pool,
      this.smtp,
      this.accounts.credentialsFor(row),
      this.storage,
      this.cache,
    )
  }

  async listMailboxes(userId: string, accountId: string): Promise<MailboxDto[]> {
    const provider = await this.provider(userId, accountId)
    return this.run(() => provider.listMailboxes(), '无法读取邮箱文件夹')
  }

  async listMessages(
    userId: string,
    accountId: string,
    options: { mailbox: string; page: number; pageSize: number; query?: string },
  ): Promise<MessagePageDto> {
    const provider = await this.provider(userId, accountId)
    return this.run(() => provider.listMessages(options), '无法读取邮件列表')
  }

  async listUnified(
    userId: string,
    options: { mailbox: string; page: number; pageSize: number; query?: string },
  ): Promise<UnifiedMessagePageDto> {
    const accounts = this.accounts.list(userId)
    const messages: UnifiedMessageDto[] = []
    let total = 0
    let failed = 0

    // Accounts are independent IMAP connections, so fetch them in parallel;
    // each one still walks its own pages in order.
    const results = await Promise.allSettled(
      accounts.map(async (account) => {
        const provider = await this.provider(userId, account.id)
        const collected: UnifiedMessageDto[] = []
        let accountTotal = 0
        for (let current = 1; current <= options.page; current += 1) {
          const pageData = await this.cachedPage(provider, account.id, options, current)
          if (current === 1) accountTotal = pageData.total
          collected.push(
            ...pageData.messages.map((message) => ({
              ...message,
              accountId: account.id,
              accountName: account.name,
              accountColor: account.color,
            })),
          )
          if (pageData.messages.length < options.pageSize) break
        }
        return { account, messages: collected, total: accountTotal }
      }),
    )

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        messages.push(...result.value.messages)
        total += result.value.total
        return
      }
      failed += 1
      const account = accounts[index]
      const detail = result.reason instanceof Error ? result.reason.message : String(result.reason)
      this.logger.warn(`Unified inbox skipped ${account?.email ?? 'account'}: ${detail}`)
    })

    if (accounts.length > 0 && failed === accounts.length) {
      throw new BadGatewayException('无法读取统一收件箱：所有账户均连接失败')
    }

    messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const start = (options.page - 1) * options.pageSize
    return {
      messages: messages.slice(start, start + options.pageSize),
      total,
      page: options.page,
      pageSize: options.pageSize,
      ...(failed > 0 ? { failedAccounts: failed } : {}),
    }
  }

  private cachedPage(
    provider: MailProvider,
    accountId: string,
    options: { mailbox: string; pageSize: number; query?: string },
    page: number,
  ): Promise<MessagePageDto> {
    const key = `${accountId}|${options.mailbox}|${options.query ?? ''}|${options.pageSize}|${page}`
    const hit = this.unifiedPages.get(key)
    if (hit && Date.now() - hit.at < MailService.UNIFIED_TTL_MS) return Promise.resolve(hit.data)

    return provider
      .listMessages({
        mailbox: options.mailbox,
        page,
        pageSize: options.pageSize,
        query: options.query,
      })
      .then((data) => {
        if (this.unifiedPages.size >= MailService.UNIFIED_MAX_ENTRIES) this.unifiedPages.clear()
        this.unifiedPages.set(key, { at: Date.now(), data })
        return data
      })
  }

  /** Drop cached list pages after anything that changes flags, folders or mail. */
  private dropUnifiedPages(accountId?: string): void {
    if (!accountId) {
      this.unifiedPages.clear()
      return
    }
    const prefix = `${accountId}|`
    for (const key of [...this.unifiedPages.keys()]) {
      if (key.startsWith(prefix)) this.unifiedPages.delete(key)
    }
  }

  /**
   * Forget every cached view of an account. The IMAP watcher calls this when the
   * server reports new mail, so a refetch started right after a push is not
   * answered from a page that was cached a second before the message landed.
   */
  invalidateAccount(accountId: string): void {
    this.dropUnifiedPages(accountId)
    invalidateAccountCaches(accountId)
  }

  async getMessage(
    userId: string,
    accountId: string,
    mailbox: string,
    uid: number,
  ): Promise<MessageDetailDto> {
    const provider = await this.provider(userId, accountId)
    const detail = await this.run(() => provider.getMessage(mailbox, uid), '无法读取邮件内容')
    // Learning from opened mail keeps autocomplete useful even before the user
    // has sent anything to a given correspondent.
    this.contacts.record(userId, [...detail.from, ...detail.to, ...detail.cc])
    return detail
  }

  async getAttachment(
    userId: string,
    accountId: string,
    mailbox: string,
    uid: number,
    index: number,
  ): Promise<AttachmentPayload> {
    const provider = await this.provider(userId, accountId)
    return this.run(() => provider.getAttachment(mailbox, uid, index), '无法下载附件')
  }

  async setFlags(
    userId: string,
    accountId: string,
    mailbox: string,
    uid: number,
    flags: FlagUpdate,
  ): Promise<void> {
    const provider = await this.provider(userId, accountId)
    await this.run(() => provider.setFlags(mailbox, uid, flags), '无法更新邮件状态')
    this.dropUnifiedPages(accountId)
  }

  async setFlagsMany(
    userId: string,
    accountId: string,
    mailbox: string,
    uids: number[],
    flags: FlagUpdate,
  ): Promise<void> {
    const provider = await this.provider(userId, accountId)
    await this.run(() => provider.setFlagsMany(mailbox, uids, flags), '无法批量更新邮件状态')
    this.dropUnifiedPages(accountId)
  }

  async markMailboxRead(userId: string, accountId: string, mailbox: string): Promise<void> {
    const provider = await this.provider(userId, accountId)
    await this.run(() => provider.markMailboxRead(mailbox), '无法将邮件标为已读')
    this.dropUnifiedPages(accountId)
  }

  async move(
    userId: string,
    accountId: string,
    mailbox: string,
    uid: number,
    destination: string,
  ): Promise<MoveOutcome> {
    const provider = await this.provider(userId, accountId)
    const outcome = await this.run(() => provider.move(mailbox, uid, destination), '无法移动邮件')
    this.dropUnifiedPages(accountId)
    return outcome
  }

  async moveMany(
    userId: string,
    accountId: string,
    mailbox: string,
    uids: number[],
    destination: string,
  ): Promise<MoveOutcome> {
    const provider = await this.provider(userId, accountId)
    const outcome = await this.run(
      () => provider.moveMany(mailbox, uids, destination),
      '无法批量移动邮件',
    )
    this.dropUnifiedPages(accountId)
    return outcome
  }

  async remove(
    userId: string,
    accountId: string,
    mailbox: string,
    uid: number,
  ): Promise<MoveOutcome> {
    const provider = await this.provider(userId, accountId)
    const outcome = await this.run(() => provider.delete(mailbox, uid), '无法删除邮件')
    this.dropUnifiedPages(accountId)
    return outcome
  }

  async removeMany(
    userId: string,
    accountId: string,
    mailbox: string,
    uids: number[],
  ): Promise<MoveOutcome> {
    const provider = await this.provider(userId, accountId)
    const outcome = await this.run(() => provider.deleteMany(mailbox, uids), '无法批量删除邮件')
    this.dropUnifiedPages(accountId)
    return outcome
  }

  async saveDraft(
    userId: string,
    accountId: string,
    draft: DraftPayload,
  ): Promise<SavedDraft | null> {
    const provider = await this.provider(userId, accountId)
    return this.run(() => provider.saveDraft(draft), '无法保存草稿到服务器')
  }

  async removeDraft(
    userId: string,
    accountId: string,
    mailbox: string,
    uid: number,
  ): Promise<void> {
    const provider = await this.provider(userId, accountId)
    await this.run(() => provider.removeDraft(mailbox, uid), '无法删除服务器草稿')
  }

  async createMailbox(userId: string, accountId: string, path: string): Promise<void> {
    this.assertFolderPath(path)
    const provider = await this.provider(userId, accountId)
    await this.run(() => provider.createMailbox(path.trim()), '无法创建文件夹')
    this.dropUnifiedPages(accountId)
  }

  async renameMailbox(
    userId: string,
    accountId: string,
    path: string,
    newPath: string,
  ): Promise<void> {
    this.assertFolderPath(path)
    this.assertFolderPath(newPath)
    const provider = await this.provider(userId, accountId)
    await this.run(() => provider.renameMailbox(path.trim(), newPath.trim()), '无法重命名文件夹')
    this.dropUnifiedPages(accountId)
  }

  async deleteMailbox(userId: string, accountId: string, path: string): Promise<void> {
    this.assertFolderPath(path)
    const provider = await this.provider(userId, accountId)
    await this.run(() => provider.deleteMailbox(path.trim()), '无法删除文件夹')
    this.dropUnifiedPages(accountId)
  }

  async emptyMailbox(userId: string, accountId: string, path: string): Promise<void> {
    this.assertFolderPath(path)
    const provider = await this.provider(userId, accountId)
    await this.run(() => provider.emptyMailbox(path.trim()), '无法清空文件夹')
    this.dropUnifiedPages(accountId)
  }

  private assertFolderPath(path: string): void {
    if (!path.trim()) throw new BadRequestException('文件夹名称不能为空')
    if (path.trim().toUpperCase() === 'INBOX') {
      throw new BadRequestException('收件箱不支持该操作')
    }
  }

  async send(
    userId: string,
    accountId: string,
    input: {
      to: string
      cc?: string
      bcc?: string
      subject: string
      text?: string
      html?: string
      inReplyTo?: string
      references?: string
      files: Express.Multer.File[]
    },
  ): Promise<SendResultDto> {
    if (![input.to, input.cc, input.bcc].some((value) => value?.trim())) {
      throw new BadRequestException('请至少填写一个收件人')
    }
    if (
      [input.to, input.cc, input.bcc, input.subject].some((value) => /[\r\n]/.test(value ?? ''))
    ) {
      throw new BadRequestException('收件人与主题不能包含换行符')
    }
    const attachments: OutgoingAttachment[] = input.files.map((file) => ({
      filename: basename(file.originalname).replace(/[\r\n]/g, '_'),
      contentType: file.mimetype || 'application/octet-stream',
      // Multer wrote the upload straight to disk; the composer reads it back.
      path: file.path,
      size: file.size,
    }))
    const totalBytes = attachments.reduce((sum, item) => sum + item.size, 0)
    if (totalBytes > this.accounts.maxAttachmentBytes) {
      throw new BadRequestException(
        `附件总大小不能超过 ${Math.round(this.accounts.maxAttachmentBytes / 1024 / 1024)} MB`,
      )
    }

    if (this.clamav.enabled) {
      for (const attachment of attachments) {
        await this.clamav.scanFile(attachment.path, attachment.filename)
      }
    }

    const message: OutgoingMessage = {
      to: input.to.trim(),
      cc: input.cc?.trim() || undefined,
      bcc: input.bcc?.trim() || undefined,
      subject: input.subject.trim(),
      text: input.text,
      html: input.html,
      inReplyTo: input.inReplyTo,
      references: input.references ? input.references.split(/\s+/).filter(Boolean) : undefined,
      attachments,
    }

    const provider = await this.provider(userId, accountId)
    const result = await this.run(() => provider.send(message), '邮件发送失败')
    this.dropUnifiedPages(accountId)
    this.contacts.record(userId, [
      ...parseAddressList(input.to),
      ...parseAddressList(input.cc),
      ...parseAddressList(input.bcc),
    ])
    return result
  }

  private async run<T>(action: () => Promise<T>, fallback: string): Promise<T> {
    try {
      return await action()
    } catch (error) {
      if (error instanceof HttpException) throw error
      const detail = error instanceof Error ? error.message : String(error)
      const extra = error as Error & {
        code?: string
        command?: string
        responseText?: string
      }
      this.logger.warn(
        `${fallback}: ${detail}` +
          (extra.code ? ` [code=${extra.code}]` : '') +
          (extra.command ? ` [command=${extra.command}]` : '') +
          (extra.responseText ? ` [response=${extra.responseText}]` : ''),
      )
      throw new BadGatewayException(`${fallback}：${detail}`)
    }
  }
}
