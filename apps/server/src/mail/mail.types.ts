import type {
  AddressDto,
  MailboxDto,
  MessageDetailDto,
  MessagePageDto,
  MoveOutcomeDto,
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
  /** Absolute path of the uploaded file; the MIME message is streamed from disk. */
  path: string
  size: number
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
  size: number
  /** Local file holding the bytes; streamed to the client when present. */
  path: string | null
  /** In-memory bytes, used by providers that have no disk cache (demo workspace). */
  content: Buffer | null
}

export type MoveOutcome = MoveOutcomeDto

export type DeleteResult = MoveOutcome

export interface MailProvider {
  listMailboxes(): Promise<MailboxDto[]>
  listMessages(options: ListMessagesOptions): Promise<MessagePageDto>
  getMessage(mailbox: string, uid: number): Promise<MessageDetailDto>
  getAttachment(mailbox: string, uid: number, index: number): Promise<AttachmentPayload>
  setFlags(mailbox: string, uid: number, flags: FlagUpdate): Promise<void>
  setFlagsMany(mailbox: string, uids: number[], flags: FlagUpdate): Promise<void>
  markMailboxRead(mailbox: string): Promise<void>
  move(mailbox: string, uid: number, destination: string): Promise<MoveOutcome>
  moveMany(mailbox: string, uids: number[], destination: string): Promise<MoveOutcome>
  delete(mailbox: string, uid: number): Promise<DeleteResult>
  deleteMany(mailbox: string, uids: number[]): Promise<DeleteResult>
  createMailbox(path: string): Promise<void>
  renameMailbox(path: string, newPath: string): Promise<void>
  deleteMailbox(path: string): Promise<void>
  emptyMailbox(path: string): Promise<void>
  send(message: OutgoingMessage): Promise<SendResultDto>
  test(): Promise<TestResultDto>
}

export type { AddressDto }
