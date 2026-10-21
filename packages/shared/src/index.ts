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
  isAdmin: boolean
  createdAt: string
}

export interface AppConfigDto {
  initialized: boolean
  siteName: string
  allowRegistration: boolean
  demoEnabled: boolean
  recoveryEnabled: boolean
  version: string
  maxAttachmentMb: number
}

export interface SystemSettingsDto {
  initialized: boolean
  siteName: string
  allowRegistration: boolean
  demoEnabled: boolean
}

export type DefaultView = 'account' | 'unified'
export type ListDensity = 'comfortable' | 'compact'

export interface UserPreferencesDto {
  /** Automatic refresh interval in seconds; 0 disables polling. */
  refreshSeconds: number
  pageSize: number
  autoMarkRead: boolean
  loadRemoteImages: boolean
  defaultView: DefaultView
  density: ListDensity
}

export type UpdatePreferencesPayload = Partial<UserPreferencesDto>

export const DEFAULT_PREFERENCES: UserPreferencesDto = {
  refreshSeconds: 60,
  pageSize: 30,
  autoMarkRead: true,
  loadRemoteImages: false,
  defaultView: 'account',
  density: 'comfortable',
}

export interface SetupAdminDto {
  name: string
  email: string
  password: string
}

export interface SetupPayload {
  siteName: string
  allowRegistration: boolean
  demoEnabled: boolean
  admin: SetupAdminDto
}

export interface UpdateSystemSettingsPayload {
  siteName?: string
  allowRegistration?: boolean
  demoEnabled?: boolean
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
