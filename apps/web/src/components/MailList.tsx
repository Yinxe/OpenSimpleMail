import type { MessageSummaryDto } from '@osm/shared'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Mail,
  MailCheck,
  MailOpen,
  Menu,
  Paperclip,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import type { RefObject } from 'react'
import { displayAddress, formatListDate } from '@/lib/format'
import { Avatar } from './Avatar'

export interface MailListItem extends MessageSummaryDto {
  accountId?: string
  accountName?: string
  accountColor?: string
}

interface MailListProps {
  title: string
  subtitle?: string
  items: MailListItem[]
  loading: boolean
  refreshing: boolean
  selectedKey: string | null
  total: number
  page: number
  pageSize: number
  unified: boolean
  search: string
  searchRef: RefObject<HTMLInputElement | null>
  onSearchChange: (value: string) => void
  onSelect: (item: MailListItem) => void
  onStar: (item: MailListItem) => void
  onToggleRead: (item: MailListItem) => void
  onDelete: (item: MailListItem) => void
  onPage: (page: number) => void
  onRefresh: () => void
  unreadCount: number
  onMarkAllRead: () => void
  markingAllRead: boolean
  canMarkAllRead: boolean
  refreshHint?: string
  error?: string | null
  onRetry: () => void
  onMenu?: () => void
  emptyTitle?: string
  emptyBody?: string
}

function SkeletonRows() {
  return (
    <div className="mail-list__skeleton" aria-hidden="true">
      {Array.from({ length: 7 }).map((_, index) => (
        <div className="skeleton-row" key={index}>
          <span className="skeleton skeleton--avatar" />
          <div className="skeleton-row__body">
            <span
              className="skeleton skeleton--line"
              style={{ width: `${38 + (index % 3) * 12}%` }}
            />
            <span
              className="skeleton skeleton--line"
              style={{ width: `${58 + (index % 2) * 14}%` }}
            />
            <span className="skeleton skeleton--line skeleton--short" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function MailList({
  title,
  subtitle,
  items,
  loading,
  refreshing,
  selectedKey,
  total,
  page,
  pageSize,
  unified,
  search,
  searchRef,
  onSearchChange,
  onSelect,
  onStar,
  onToggleRead,
  onDelete,
  onPage,
  onRefresh,
  unreadCount,
  onMarkAllRead,
  markingAllRead,
  canMarkAllRead,
  refreshHint,
  error,
  onRetry,
  onMenu,
  emptyTitle,
  emptyBody,
}: MailListProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section className="mail-list" aria-label="邮件列表">
      <header className="mail-list__head">
        {onMenu ? (
          <button
            type="button"
            className="icon-button mail-list__menu"
            onClick={onMenu}
            aria-label="打开导航"
          >
            <Menu size={18} />
          </button>
        ) : null}
        <div className="mail-list__heading">
          <h1>{title}</h1>
          <p>
            {subtitle ? `${subtitle} · ` : ''}
            {total > 0 ? `${total} 封` : '暂无邮件'}
          </p>
        </div>
        {refreshHint ? <span className="mail-list__refresh-hint">{refreshHint}</span> : null}
        {canMarkAllRead ? (
          <button
            type="button"
            className="button button--soft button--sm mail-list__mark-read"
            onClick={onMarkAllRead}
            disabled={markingAllRead || unreadCount === 0}
            title="将当前文件夹的全部邮件标为已读"
          >
            {markingAllRead ? (
              <Loader2 size={14} className="is-spinning" />
            ) : (
              <MailCheck size={14} />
            )}
            <span>{unreadCount > 0 ? `全部已读 ${unreadCount}` : '全部已读'}</span>
          </button>
        ) : null}
        <button
          type="button"
          className="icon-button"
          onClick={onRefresh}
          title={refreshHint ? `刷新（${refreshHint}）` : '刷新'}
          aria-label="刷新"
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'is-spinning' : undefined} />
        </button>
      </header>

      <div className="mail-list__search">
        <Search size={15} className="mail-list__search-icon" />
        <input
          ref={searchRef}
          type="search"
          value={search}
          placeholder={unified ? '搜索所有账户的收件箱…' : '搜索当前文件夹…'}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label="搜索邮件"
        />
        {search ? (
          <button
            type="button"
            className="mail-list__search-clear"
            onClick={() => onSearchChange('')}
            aria-label="清除搜索"
          >
            <X size={14} />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>

      <div className="mail-list__body">
        {loading ? <SkeletonRows /> : null}

        {!loading && error && items.length > 0 ? (
          <div className="mail-list__error-banner" role="alert">
            <AlertTriangle size={14} />
            <span>刷新失败：{error}</span>
            <button type="button" onClick={onRetry}>
              重试
            </button>
          </div>
        ) : null}

        {!loading && error && items.length === 0 ? (
          <div className="empty-state empty-state--error">
            <span className="empty-state__icon">
              <AlertTriangle size={26} />
            </span>
            <h3>无法加载邮件</h3>
            <p>{error}</p>
            <button
              type="button"
              className="button button--soft button--sm empty-state__retry"
              onClick={onRetry}
            >
              重试
            </button>
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              <Inbox size={26} />
            </span>
            <h3>{emptyTitle ?? (search ? '没有找到匹配的邮件' : '这里还没有邮件')}</h3>
            <p>{emptyBody ?? (search ? '换一个关键词试试。' : '新邮件会出现在这里。')}</p>
          </div>
        ) : null}

        {!loading
          ? items.map((item) => {
              const sender = item.from[0]
              // UIDs are only unique inside a mailbox, and the starred view
              // merges several folders, so the folder is part of the key.
              const rowKey = `${item.accountId ?? 'local'}:${item.mailbox ?? 'local'}:${item.uid}`
              const selected = rowKey === selectedKey
              return (
                // biome-ignore lint/a11y/useSemanticElements: the row contains action buttons, so a button element would nest interactive controls
                <div
                  key={rowKey}
                  className={`mail-row ${selected ? 'is-selected' : ''} ${
                    item.unread ? 'is-unread' : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(item)
                    }
                  }}
                >
                  <span
                    className={`mail-row__status ${item.unread ? 'is-unread' : 'is-read'}`}
                    title={item.unread ? '未读' : '已读'}
                  >
                    {item.unread ? <span className="mail-row__dot" /> : <Check size={12} />}
                  </span>
                  <Avatar
                    name={sender ? displayAddress(sender) : '?'}
                    seed={sender?.address ?? item.subject}
                    size="md"
                  />
                  <div className="mail-row__main">
                    <div className="mail-row__top">
                      <span className="mail-row__sender">
                        {sender ? displayAddress(sender) : '未知发件人'}
                      </span>
                      <span className="mail-row__date">{formatListDate(item.date)}</span>
                    </div>
                    <div className="mail-row__subject">
                      {item.subject.trim() || '(无主题)'}
                      {item.starred ? (
                        <Star size={12} className="mail-row__starred" fill="currentColor" />
                      ) : null}
                    </div>
                    {item.preview ? <p className="mail-row__preview">{item.preview}</p> : null}
                    <div className="mail-row__meta">
                      {unified && item.accountName ? (
                        <span
                          className="account-chip"
                          style={{ color: item.accountColor, borderColor: item.accountColor }}
                        >
                          {item.accountName}
                        </span>
                      ) : null}
                      {item.hasAttachments ? (
                        <span className="mail-row__attach">
                          <Paperclip size={12} /> 附件
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mail-row__actions">
                    <button
                      type="button"
                      className="row-action"
                      title={item.unread ? '标为已读' : '标为未读'}
                      aria-label={item.unread ? '标为已读' : '标为未读'}
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleRead(item)
                      }}
                    >
                      {item.unread ? <MailOpen size={15} /> : <Mail size={15} />}
                    </button>
                    <button
                      type="button"
                      className={`row-action ${item.starred ? 'is-on' : ''}`}
                      title={item.starred ? '取消收藏' : '收藏（可在左侧「收藏」查看）'}
                      aria-label={item.starred ? '取消收藏' : '收藏'}
                      aria-pressed={item.starred}
                      onClick={(event) => {
                        event.stopPropagation()
                        onStar(item)
                      }}
                    >
                      <Star size={15} fill={item.starred ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      className="row-action row-action--danger"
                      title="删除邮件"
                      aria-label="删除邮件"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDelete(item)
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })
          : null}
      </div>

      {!unified && total > pageSize ? (
        <footer className="mail-list__foot">
          <span>
            第 {page} / {pages} 页
          </span>
          <div className="pager">
            <button
              type="button"
              className="icon-button"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              aria-label="上一页"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={page >= pages}
              onClick={() => onPage(page + 1)}
              aria-label="下一页"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </footer>
      ) : null}

      {loading && items.length > 0 ? (
        <div className="mail-list__loading-more">
          <Loader2 size={15} className="is-spinning" />
        </div>
      ) : null}
    </section>
  )
}
