import { basename } from 'node:path'
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common'
import type { MailboxDto, MessageDetailDto, MessagePageDto, SendResultDto } from '@osm/shared'
import { AccountsService } from '../accounts/accounts.service'
import { DemoService } from '../demo/demo.service'
import { ImapPool } from './imap.pool'
import { ImapProvider } from './imap.provider'
import type {
  AttachmentPayload,
  FlagUpdate,
  MailProvider,
  OutgoingAttachment,
  OutgoingMessage,
} from './mail.types'
import { SmtpService } from './smtp.service'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)

  constructor(
    private readonly accounts: AccountsService,
    private readonly demo: DemoService,
    private readonly pool: ImapPool,
    private readonly smtp: SmtpService,
  ) {}

  async provider(userId: string, accountId: string): Promise<MailProvider> {
    const row = this.accounts.getRow(userId, accountId)
    if (row.kind === 'demo') return this.demo.providerFor(row)
    return new ImapProvider(this.pool, this.smtp, this.accounts.credentialsFor(row))
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

  async getMessage(
    userId: string,
    accountId: string,
    mailbox: string,
    uid: number,
  ): Promise<MessageDetailDto> {
    const provider = await this.provider(userId, accountId)
    return this.run(() => provider.getMessage(mailbox, uid), '无法读取邮件内容')
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
  }

  async move(
    userId: string,
    accountId: string,
    mailbox: string,
    uid: number,
    destination: string,
  ): Promise<void> {
    const provider = await this.provider(userId, accountId)
    await this.run(() => provider.move(mailbox, uid, destination), '无法移动邮件')
  }

  async remove(
    userId: string,
    accountId: string,
    mailbox: string,
    uid: number,
  ): Promise<{ movedTo?: string }> {
    const provider = await this.provider(userId, accountId)
    return this.run(() => provider.delete(mailbox, uid), '无法删除邮件')
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
      content: file.buffer,
    }))
    const totalBytes = attachments.reduce((sum, item) => sum + item.content.byteLength, 0)
    if (totalBytes > this.accounts.maxAttachmentBytes) {
      throw new BadRequestException(
        `附件总大小不能超过 ${Math.round(this.accounts.maxAttachmentBytes / 1024 / 1024)} MB`,
      )
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
    return this.run(() => provider.send(message), '邮件发送失败')
  }

  private async run<T>(action: () => Promise<T>, fallback: string): Promise<T> {
    try {
      return await action()
    } catch (error) {
      if (error instanceof HttpException) throw error
      const detail = error instanceof Error ? error.message : String(error)
      this.logger.warn(`${fallback}: ${detail}`)
      throw new BadGatewayException(`${fallback}：${detail}`)
    }
  }
}
