import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import type { MailboxDto, MessageDetailDto, MessagePageDto, SendResultDto } from '@osm/shared'
import type { Response } from 'express'
import { memoryStorage } from 'multer'
import { CurrentUser } from '../auth/auth.decorators'
import {
  BulkDeleteDto,
  BulkFlagUpdateDto,
  BulkMoveDto,
  FlagUpdateDto,
  ListMessagesQueryDto,
  MailboxQueryDto,
  MoveMessageDto,
  SendMessageDto,
} from './mail.dto'
import { MailService } from './mail.service'

function contentDisposition(filename: string): string {
  const safe = filename.replace(/[\r\n"\\]/g, '_')
  const fallback = safe.replace(/[^\x20-\x7e]/g, '_')
  const encoded = encodeURIComponent(safe).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

@Controller('accounts/:accountId')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get('mailboxes')
  mailboxes(
    @CurrentUser('id') userId: string,
    @Param('accountId') accountId: string,
  ): Promise<MailboxDto[]> {
    return this.mail.listMailboxes(userId, accountId)
  }

  @Get('messages')
  messages(
    @CurrentUser('id') userId: string,
    @Param('accountId') accountId: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<MessagePageDto> {
    return this.mail.listMessages(userId, accountId, {
      mailbox: query.mailbox,
      page: query.page,
      pageSize: query.pageSize,
      query: query.q,
    })
  }

  @Get('messages/:uid')
  message(
    @CurrentUser('id') userId: string,
    @Param('accountId') accountId: string,
    @Param('uid', ParseIntPipe) uid: number,
    @Query() query: MailboxQueryDto,
  ): Promise<MessageDetailDto> {
    return this.mail.getMessage(userId, accountId, query.mailbox, uid)
  }

  @Get('messages/:uid/attachments/:index')
  async attachment(
    @CurrentUser('id') userId: string,
    @Param('accountId') accountId: string,
    @Param('uid', ParseIntPipe) uid: number,
    @Param('index', ParseIntPipe) index: number,
    @Query() query: MailboxQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.mail.getAttachment(userId, accountId, query.mailbox, uid, index)
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Length', String(file.content.byteLength))
    res.setHeader('Content-Disposition', contentDisposition(file.filename))
    res.setHeader('Cache-Control', 'private, max-age=300')
    return new StreamableFile(file.content)
  }

  @Post('mailboxes/read')
  @HttpCode(204)
  async markMailboxRead(
    @CurrentUser('id') userId: string,
    @Param('accountId') accountId: string,
    @Body() body: MailboxQueryDto,
  ): Promise<void> {
    await this.mail.markMailboxRead(userId, accountId, body.mailbox)
  }

  @Post('messages/bulk/flags')
  @HttpCode(204)
  async bulkFlags(
    @CurrentUser('id') userId: string,
    @Param('accountId') accountId: string,
    @Body() body: BulkFlagUpdateDto,
  ): Promise<void> {
    await this.mail.setFlagsMany(userId, accountId, body.mailbox, body.uids, {
      seen: body.seen,
      flagged: body.flagged,
    })
  }

  @Post('messages/bulk/move')
  @HttpCode(204)
  async bulkMove(
    @CurrentUser('id') userId: string,
    @Param('accountId') accountId: string,
    @Body() body: BulkMoveDto,
  ): Promise<void> {
    await this.mail.moveMany(userId, accountId, body.mailbox, body.uids, body.destination)
  }

  @Post('messages/bulk/delete')
  @HttpCode(200)
  async bulkDelete(
    @CurrentUser('id') userId: string,
    @Param('accountId') accountId: string,
    @Body() body: BulkDeleteDto,
  ): Promise<{ movedTo?: string }> {
    return this.mail.removeMany(userId, accountId, body.mailbox, body.uids)
  }

  @Post('messages/:uid/flags')
  @HttpCode(204)
  async flags(
    @CurrentUser('id') userId: string,
    @Param('accountId') accountId: string,
    @Param('uid', ParseIntPipe) uid: number,
    @Query() query: MailboxQueryDto,
    @Body() body: FlagUpdateDto,
  ): Promise<void> {
    await this.mail.setFlags(userId, accountId, query.mailbox, uid, {
      seen: body.seen,
      flagged: body.flagged,
    })
  }

  @Post('messages/:uid/move')
  @HttpCode(204)
  async move(
    @CurrentUser('id') userId: string,
    @Param('accountId') accountId: string,
    @Param('uid', ParseIntPipe) uid: number,
    @Body() body: MoveMessageDto,
  ): Promise<void> {
    await this.mail.move(userId, accountId, body.mailbox, uid, body.destination)
  }

  @Delete('messages/:uid')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('accountId') accountId: string,
    @Param('uid', ParseIntPipe) uid: number,
    @Query() query: MailboxQueryDto,
  ): Promise<{ movedTo?: string }> {
    return this.mail.remove(userId, accountId, query.mailbox, uid)
  }

  @Post('send')
  @HttpCode(200)
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024, files: 10 },
    }),
  )
  async send(
    @CurrentUser('id') userId: string,
    @Param('accountId') accountId: string,
    @Body() body: SendMessageDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ): Promise<SendResultDto> {
    return this.mail.send(userId, accountId, {
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
      inReplyTo: body.inReplyTo,
      references: body.references,
      files,
    })
  }
}
