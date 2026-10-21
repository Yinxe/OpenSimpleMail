import type {
  AddressDto,
  MailboxDto,
  MessageDetailDto,
  MessagePageDto,
  SendResultDto,
  TestResultDto,
} from '@osm/shared'

export interface MailCredentials {
  accountId: string
  name: string
  email: string
  username: string
  password: string
  imap: { host: string; port: number; secure: boolean }
  smtp: { host: string; port: number; secure: boolean }
}

export interface ListMessagesOptions {
  mailbox: string
  page: number
  pageSize: number
  query?: string
}

export interface OutgoingAttachment {
  filename: string
  contentType: string
  content: Buffer
}

export interface OutgoingMessage {
  to: string
  cc?: string
  bcc?: string
  subject: string
  text?: string
  html?: string
  attachments: OutgoingAttachment[]
  inReplyTo?: string
  references?: string[]
}

export interface FlagUpdate {
  seen?: boolean
  flagged?: boolean
}

export interface AttachmentPayload {
  filename: string
  contentType: string
  content: Buffer
}

export interface DeleteResult {
  movedTo?: string
}

export interface MailProvider {
  listMailboxes(): Promise<MailboxDto[]>
  listMessages(options: ListMessagesOptions): Promise<MessagePageDto>
  getMessage(mailbox: string, uid: number): Promise<MessageDetailDto>
  getAttachment(mailbox: string, uid: number, index: number): Promise<AttachmentPayload>
  setFlags(mailbox: string, uid: number, flags: FlagUpdate): Promise<void>
  markMailboxRead(mailbox: string): Promise<void>
  move(mailbox: string, uid: number, destination: string): Promise<void>
  delete(mailbox: string, uid: number): Promise<DeleteResult>
  send(message: OutgoingMessage): Promise<SendResultDto>
  test(): Promise<TestResultDto>
}

export type { AddressDto }
