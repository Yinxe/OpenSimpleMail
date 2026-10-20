import type { AccountDto, MailboxDto, UserDto } from '@osm/shared'
import {
  Archive,
  FileText,
  Folder,
  Inbox,
  LogOut,
  MailPlus,
  PenLine,
  Plus,
  Send,
  Settings,
  ShieldAlert,
  Star,
  Trash2,
} from 'lucide-react'
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
  onSelectAccount: (accountId: string | null) => void
  onSelectMailbox: (path: string) => void
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

export function folderLabel(folder: MailboxDto): string {
  switch (folder.specialUse) {
    case '\\Inbox':
      return '收件箱'
    case '\\Flagged':
      return '星标邮件'
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
  onSelectAccount,
  onSelectMailbox,
  onCompose,
  onAddAccount,
  onSettings,
  onLogout,
}: SidebarProps) {
  const sortedMailboxes = [...mailboxes].sort((a, b) => {
    const rank = folderRank(a) - folderRank(b)
    return rank === 0 ? a.name.localeCompare(b.name, 'zh-CN') : rank
  })

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Logo />
      </div>

      <button type="button" className="compose-button" onClick={onCompose}>
        <PenLine size={17} />
        写邮件
      </button>

      <nav className="sidebar__nav">
        <button
          type="button"
          className={`nav-item nav-item--unified ${activeAccountId === null ? 'is-active' : ''}`}
          onClick={() => onSelectAccount(null)}
        >
          <span className="nav-item__icon">
            <MailPlus size={17} />
          </span>
          <span className="nav-item__label">全部收件箱</span>
          <span className="nav-item__count">
            {Object.values(accountUnread).reduce((sum, value) => sum + value, 0) || ''}
          </span>
        </button>
      </nav>

      <div className="sidebar__section">
        <div className="sidebar__section-head">
          <span>邮箱账户</span>
          <button
            type="button"
            className="sidebar__add"
            onClick={onAddAccount}
            title="添加邮箱"
            aria-label="添加邮箱"
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
              添加你的第一个邮箱
            </button>
          ) : null}
        </div>
      </div>

      <div className="sidebar__section sidebar__section--folders">
        <div className="sidebar__section-head">
          <span>文件夹</span>
        </div>
        {activeAccountId ? (
          <div className="folder-list">
            {sortedMailboxes.map((folder) => (
              <button
                key={folder.path}
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
            ))}
            {sortedMailboxes.length === 0 ? <p className="sidebar__hint">正在读取文件夹…</p> : null}
          </div>
        ) : (
          <p className="sidebar__hint">
            选择上方某个邮箱查看它的文件夹；全部收件箱会按时间合并所有账户的来信。
          </p>
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
            title="设置"
            aria-label="设置"
          >
            <Settings size={17} />
          </button>
          <button
            type="button"
            className="icon-button icon-button--ghost"
            onClick={onLogout}
            title="退出登录"
            aria-label="退出登录"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  )
}
