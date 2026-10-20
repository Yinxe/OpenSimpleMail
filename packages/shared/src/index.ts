/**
 * API contracts shared by the NestJS server and the React client.
 * Keep this package free of runtime dependencies so it can be consumed by both.
 */

export type AccountKind = 'imap' | 'demo'

export interface UserDto {
  id: string
  email: string
  name: string
  isDemo: boolean
  createdAt: string
}

export interface AppConfigDto {
  demoEnabled: boolean
  version: string
  maxAttachmentMb: number
}

export interface ServerSettingsDto {
  host: string
  port: number
  secure: boolean
}

export interface AccountDto {
  id: string
  name: string
  email: string
  username: string
  kind: AccountKind
  color: string
  hasPassword: boolean
  imap: ServerSettingsDto
  smtp: ServerSettingsDto
  createdAt: string
  updatedAt: string
}

export interface MailboxDto {
  path: string
  name: string
  delimiter: string
  /** IMAP special-use flag, e.g. `\\Inbox`, `\\Sent`, `\\Trash`. */
  specialUse: string | null
  total: number
  unread: number
}

export interface AddressDto {
  name: string | null
  address: string
}

export interface AttachmentDto {
  index: number
  filename: string
  contentType: string
  size: number
  inline: boolean
}

export interface MessageSummaryDto {
  uid: number
  subject: string
  from: AddressDto[]
  to: AddressDto[]
  date: string
  flags: string[]
  unread: boolean
  starred: boolean
  hasAttachments: boolean
  preview?: string
  size?: number
}

export interface MessageDetailDto extends MessageSummaryDto {
  mailbox: string
  cc: AddressDto[]
  bcc: AddressDto[]
  replyTo: AddressDto[]
  text: string | null
  html: string | null
  attachments: AttachmentDto[]
  messageId: string | null
  inReplyTo: string | null
  references: string[]
}

export interface MessagePageDto {
  mailbox: string
  messages: MessageSummaryDto[]
  total: number
  page: number
  pageSize: number
}

export interface SendResultDto {
  messageId: string
  accepted: string[]
}

export interface TestResultDto {
  imap: 'ok'
  smtp: 'ok'
  durationMs: number
}

export interface ApiErrorBody {
  statusCode: number
  message: string | string[]
  error?: string
}

export interface HealthDto {
  status: 'ok'
  version: string
  demoEnabled: boolean
}

/** Common mailbox special-use values returned by IMAP servers. */
export const SPECIAL_USE = {
  inbox: '\\Inbox',
  sent: '\\Sent',
  drafts: '\\Drafts',
  trash: '\\Trash',
  junk: '\\Junk',
  archive: '\\Archive',
  flagged: '\\Flagged',
  all: '\\All',
} as const
