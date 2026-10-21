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
  /** Show a desktop notification for new mail while the tab is in the background. */
  desktopNotifications: boolean
  defaultView: DefaultView
  density: ListDensity
}

export type UpdatePreferencesPayload = Partial<UserPreferencesDto>

export const DEFAULT_PREFERENCES: UserPreferencesDto = {
  refreshSeconds: 60,
  pageSize: 30,
  autoMarkRead: true,
  loadRemoteImages: false,
  desktopNotifications: false,
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
  /** Plain-text signature appended to new messages and placed above quotes. */
  signature: string
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

/** A recipient learned from sent or received mail, used by composer autocomplete. */
export interface ContactDto {
  email: string
  name: string
  lastUsed: string
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
  /**
   * Folder the message actually lives in. Always set by the server so views
   * that merge several folders (the starred view) can act on a single row.
   */
  mailbox?: string
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

export interface UnifiedMessageDto extends MessageSummaryDto {
  accountId: string
  accountName: string
  accountColor: string
}

export interface UnifiedMessagePageDto {
  messages: UnifiedMessageDto[]
  total: number
  page: number
  pageSize: number
  /** Number of accounts that could not be read for this page. */
  failedAccounts?: number
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

/**
 * Virtual mailbox path that aggregates flagged messages. It never maps to a
 * real IMAP folder: the server resolves it by searching every folder (or the
 * provider's `\Flagged` folder when one exists) and returns real folder paths
 * on each summary.
 */
export const STARRED_MAILBOX = '__starred__'

export function isStarredMailbox(path: string | null | undefined): boolean {
  return path === STARRED_MAILBOX
}
