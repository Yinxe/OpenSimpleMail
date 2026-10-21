import { type AccountDto, type MailboxDto, STARRED_MAILBOX, type UserDto } from '@osm/shared'
import {
  Archive,
  ChevronDown,
  ChevronRight,
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
import { type ReactNode, useState } from 'react'
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

interface FolderNode {
  path: string
  name: string
  depth: number
  mailbox?: MailboxDto
  children: FolderNode[]
}

/**
 * Group flat IMAP paths into a tree using each mailbox's own delimiter, so
 * `Projects/2026` nests under `Projects`. Intermediate nodes without a real
 * mailbox are kept as plain labels that only toggle their children.
 */
function buildFolderTree(mailboxes: MailboxDto[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>()
  const roots: FolderNode[] = []

  for (const mailbox of mailboxes) {
    const delimiter = mailbox.delimiter || '/'
    const segments = mailbox.path.split(delimiter).filter(Boolean)
    let parentPath = ''
    let siblings = roots

    segments.forEach((segment, index) => {
      const path = parentPath ? `${parentPath}${delimiter}${segment}` : segment
      let node = nodes.get(path)
      if (!node) {
        node = { path, name: segment, depth: index, children: [] }
        nodes.set(path, node)
        siblings.push(node)
      }
      if (index === segments.length - 1) node.mailbox = mailbox
      parentPath = path
      siblings = node.children
    })
  }

  return roots
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
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const sortedMailboxes = [...mailboxes]
    // The starred view is a first-class entry above the account list, so the
    // provider's own `\Flagged` folder would only duplicate it.
    .filter((folder) => folder.specialUse !== '\\Flagged')
    .sort((a, b) => {
      const rank = folderRank(a) - folderRank(b)
      return rank === 0 ? a.name.localeCompare(b.name, 'zh-CN') : rank
    })
  const folderTree = buildFolderTree(sortedMailboxes)
  const starredActive = activeMailbox === STARRED_MAILBOX

  function toggleFolder(path: string) {
    setCollapsedFolders((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function renderFolder(node: FolderNode): ReactNode {
    const folder = node.mailbox
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsedFolders.has(node.path)
    const custom = folder ? !folder.specialUse : false
    const indent = { paddingLeft: `${10 + node.depth * 14}px` }

    return (
      <div key={node.path} className="folder-tree__group">
        <div className="folder-row">
          {hasChildren ? (
            <button
              type="button"
              className="folder-row__toggle"
              onClick={() => toggleFolder(node.path)}
              aria-label={isCollapsed ? t('sidebar.expandFolder') : t('sidebar.collapseFolder')}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : (
            <span className="folder-row__toggle folder-row__toggle--empty" />
          )}

          {folder ? (
            <button
              type="button"
              className={`folder-item ${activeMailbox === folder.path ? 'is-active' : ''}`}
              onClick={() => onSelectMailbox(folder.path)}
              style={indent}
              title={folder.path}
            >
              <FolderIcon folder={folder} />
              <span className="folder-item__label">{folderLabel(folder, t)}</span>
              {folder.unread > 0 ? (
                <span className="folder-item__count">{folder.unread}</span>
              ) : null}
            </button>
          ) : (
            <span className="folder-item folder-item--label" style={indent}>
              <Folder size={15} />
              <span className="folder-item__label">{node.name}</span>
            </span>
          )}

          {folder && custom ? (
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
          ) : folder?.specialUse === '\\Trash' ? (
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
        {hasChildren && !isCollapsed ? node.children.map(renderFolder) : null}
      </div>
    )
  }

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
            {folderTree.map(renderFolder)}
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
