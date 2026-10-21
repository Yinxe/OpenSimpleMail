import { type AccountDto, type MailboxDto, STARRED_MAILBOX, type UserDto } from '@osm/shared'
import {
  Archive,
  Eraser,
  FileText,
  Folder,
  Inbox,
  LogOut,
  MailPlus,
  Pencil,
  PenLine,
  Plus,
  Send,
  Settings,
  ShieldAlert,
  Star,
  Trash2,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/locales'
import { Avatar } from './Avatar'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

interface SidebarProps {
  user: UserDto
  accounts: AccountDto[]
  activeAccountId: string | null
  activeMailbox: string
  mailboxes: MailboxDto[]
  accountUnread: Record<string, number>
  starredCount?: number
  onSelectAccount: (accountId: string | null) => void
  onSelectMailbox: (path: string) => void
  onSelectStarred: () => void
  onCreateFolder: () => void
  onRenameFolder: (folder: MailboxDto) => void
  onDeleteFolder: (folder: MailboxDto) => void
  onEmptyFolder: (folder: MailboxDto) => void
  onCompose: () => void
  onAddAccount: () => void
  onSettings: () => void
  onLogout: () => void
}

const SPECIAL_ORDER = [
  '\\Inbox',
  '\\Flagged',
  '\\Drafts',
  '\\Sent',
  '\\Archive',
  '\\Junk',
  '\\Trash',
]

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

const FOLDER_KEYS: Record<string, MessageKey> = {
  '\\Inbox': 'folder.inbox',
  '\\Flagged': 'folder.starred',
  '\\Drafts': 'folder.drafts',
  '\\Sent': 'folder.sent',
  '\\Archive': 'folder.archive',
  '\\Junk': 'folder.junk',
  '\\Trash': 'folder.trash',
}

export function folderLabel(folder: MailboxDto, t?: Translate): string {
  const key = folder.specialUse ? FOLDER_KEYS[folder.specialUse] : undefined
  if (key && t) return t(key)
  switch (folder.specialUse) {
    case '\\Inbox':
      return '收件箱'
    case '\\Flagged':
      return '收藏'
    case '\\Drafts':
      return '草稿箱'
    case '\\Sent':
      return '已发送'
    case '\\Archive':
      return '归档'
    case '\\Junk':
      return '垃圾邮件'
    case '\\Trash':
      return '废纸篓'
    default:
      return folder.path === 'INBOX' ? '收件箱' : folder.name
  }
}

function FolderIcon({ folder, size = 17 }: { folder: MailboxDto; size?: number }) {
  switch (folder.specialUse) {
    case '\\Inbox':
      return <Inbox size={size} />
    case '\\Flagged':
      return <Star size={size} />
    case '\\Drafts':
      return <FileText size={size} />
    case '\\Sent':
      return <Send size={size} />
    case '\\Archive':
      return <Archive size={size} />
    case '\\Junk':
      return <ShieldAlert size={size} />
    case '\\Trash':
      return <Trash2 size={size} />
    default:
      return <Folder size={size} />
  }
}

function folderRank(folder: MailboxDto): number {
  const index = folder.specialUse ? SPECIAL_ORDER.indexOf(folder.specialUse) : -1
  return index === -1 ? SPECIAL_ORDER.length : index
}

export function Sidebar({
  user,
  accounts,
  activeAccountId,
  activeMailbox,
  mailboxes,
  accountUnread,
  starredCount,
  onSelectAccount,
  onSelectMailbox,
  onSelectStarred,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onEmptyFolder,
  onCompose,
  onAddAccount,
  onSettings,
  onLogout,
}: SidebarProps) {
  const { t } = useI18n()
  const sortedMailboxes = [...mailboxes]
    // The starred view is a first-class entry above the account list, so the
    // provider's own `\Flagged` folder would only duplicate it.
    .filter((folder) => folder.specialUse !== '\\Flagged')
    .sort((a, b) => {
      const rank = folderRank(a) - folderRank(b)
      return rank === 0 ? a.name.localeCompare(b.name, 'zh-CN') : rank
    })
  const starredActive = activeMailbox === STARRED_MAILBOX

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Logo />
      </div>

      <button type="button" className="compose-button" onClick={onCompose}>
        <PenLine size={17} />
        {t('sidebar.compose')}
      </button>

      <nav className="sidebar__nav">
        <button
          type="button"
          className={`nav-item nav-item--unified ${activeAccountId === null && !starredActive ? 'is-active' : ''}`}
          onClick={() => onSelectAccount(null)}
        >
          <span className="nav-item__icon">
            <MailPlus size={17} />
          </span>
          <span className="nav-item__label">{t('sidebar.allInbox')}</span>
          <span className="nav-item__count">
            {Object.values(accountUnread).reduce((sum, value) => sum + value, 0) || ''}
          </span>
        </button>
        <button
          type="button"
          className={`nav-item nav-item--starred ${starredActive ? 'is-active' : ''}`}
          onClick={onSelectStarred}
          title={t('sidebar.starredHint')}
        >
          <span className="nav-item__icon">
            <Star size={17} />
          </span>
          <span className="nav-item__label">{t('folder.starred')}</span>
          <span className="nav-item__count">{starredCount || ''}</span>
        </button>
      </nav>

      <div className="sidebar__section">
        <div className="sidebar__section-head">
          <span>{t('sidebar.accounts')}</span>
          <button
            type="button"
            className="sidebar__add"
            onClick={onAddAccount}
            title={t('sidebar.addAccount')}
            aria-label={t('sidebar.addAccount')}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="account-list">
          {accounts.map((account) => {
            const unread = accountUnread[account.id] ?? 0
            const active = activeAccountId === account.id
            return (
              <button
                key={account.id}
                type="button"
                className={`account-item ${active ? 'is-active' : ''}`}
                onClick={() => onSelectAccount(account.id)}
                title={account.email}
              >
                <Avatar name={account.name} seed={account.email} size="sm" color={account.color} />
                <span className="account-item__body">
                  <span className="account-item__name">{account.name}</span>
                  <span className="account-item__mail">{account.email}</span>
                </span>
                {unread > 0 ? <span className="count-pill">{unread}</span> : null}
              </button>
            )
          })}
          {accounts.length === 0 ? (
            <button type="button" className="sidebar__empty" onClick={onAddAccount}>
              {t('sidebar.addFirstAccount')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="sidebar__section sidebar__section--folders">
        <div className="sidebar__section-head">
          <span>{t('sidebar.folders')}</span>
          {activeAccountId ? (
            <button
              type="button"
              className="sidebar__add"
              onClick={onCreateFolder}
              title={t('sidebar.newFolder')}
              aria-label={t('sidebar.newFolder')}
            >
              <Plus size={14} />
            </button>
          ) : null}
        </div>
        {activeAccountId ? (
          <div className="folder-list">
            {sortedMailboxes.map((folder) => {
              const custom = !folder.specialUse
              return (
                <div className="folder-row" key={folder.path}>
                  <button
                    type="button"
                    className={`folder-item ${activeMailbox === folder.path ? 'is-active' : ''}`}
                    onClick={() => onSelectMailbox(folder.path)}
                  >
                    <FolderIcon folder={folder} />
                    <span className="folder-item__label">{folderLabel(folder)}</span>
                    {folder.unread > 0 ? (
                      <span className="folder-item__count">{folder.unread}</span>
                    ) : null}
                  </button>
                  {custom ? (
                    <span className="folder-row__actions">
                      <button
                        type="button"
                        onClick={() => onRenameFolder(folder)}
                        title={t('sidebar.renameFolder')}
                        aria-label={t('sidebar.renameFolderName', { name: folderLabel(folder, t) })}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteFolder(folder)}
                        title={t('sidebar.deleteFolder')}
                        aria-label={t('sidebar.deleteFolderName', { name: folderLabel(folder, t) })}
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  ) : folder.specialUse === '\\Trash' ? (
                    <span className="folder-row__actions">
                      <button
                        type="button"
                        onClick={() => onEmptyFolder(folder)}
                        title={t('sidebar.emptyTrash')}
                        aria-label={t('sidebar.emptyTrash')}
                      >
                        <Eraser size={13} />
                      </button>
                    </span>
                  ) : null}
                </div>
              )
            })}
            {sortedMailboxes.length === 0 ? (
              <p className="sidebar__hint">{t('sidebar.loadingFolders')}</p>
            ) : null}
          </div>
        ) : (
          <p className="sidebar__hint">{t('sidebar.folderHint')}</p>
        )}
      </div>

      <div className="sidebar__foot">
        <div className="sidebar__user">
          <Avatar name={user.name} seed={user.email} size="sm" />
          <div className="sidebar__user-text">
            <span>{user.name}</span>
            <small>{user.email}</small>
          </div>
        </div>
        <div className="sidebar__actions">
          <ThemeToggle />
          <button
            type="button"
            className="icon-button icon-button--ghost"
            onClick={onSettings}
            title={t('sidebar.settings')}
            aria-label={t('sidebar.settings')}
          >
            <Settings size={17} />
          </button>
          <button
            type="button"
            className="icon-button icon-button--ghost"
            onClick={onLogout}
            title={t('sidebar.logout')}
            aria-label={t('sidebar.logout')}
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  )
}
