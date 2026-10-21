import type { MessageSummaryDto } from '@osm/shared'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Keyboard,
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
import { type RefObject, useRef, useState } from 'react'
import { displayAddress, formatListDate } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { Avatar } from './Avatar'

export interface MailListItem extends MessageSummaryDto {
  accountId?: string
  accountName?: string
  accountColor?: string
}

/** Stable row key shared by the list, selection state and bulk actions. */
export function mailRowKey(item: MailListItem, activeAccountId?: string | null): string {
  return `${item.accountId ?? activeAccountId ?? 'local'}:${item.mailbox ?? 'local'}:${item.uid}`
}

interface MailListProps {
  title: string
  subtitle?: string
  items: MailListItem[]
  loading: boolean
  refreshing: boolean
  selectedKey: string | null
  activeAccountId?: string | null
  selectedRows: Set<string>
  onToggleSelect: (item: MailListItem, shiftKey: boolean) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onBulkRead: (seen: boolean) => void
  onBulkArchive: () => void
  onBulkDelete: () => void
  bulkBusy: boolean
  canBulkArchive: boolean
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
  onArchive: (item: MailListItem) => void
  canArchive: boolean
  onDelete: (item: MailListItem) => void
  onPage: (page: number) => void
  onRefresh: () => void
  unreadCount: number
  onMarkAllRead: () => void
  markingAllRead: boolean
  canMarkAllRead: boolean
  onShowHelp: () => void
  refreshHint?: string
  error?: string | null
  /** Non-fatal notice, e.g. some accounts could not be read in the unified view. */
  warning?: string | null
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
  activeAccountId,
  selectedRows,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onBulkRead,
  onBulkArchive,
  onBulkDelete,
  bulkBusy,
  canBulkArchive,
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
  onArchive,
  canArchive,
  onDelete,
  onPage,
  onRefresh,
  unreadCount,
  onMarkAllRead,
  markingAllRead,
  canMarkAllRead,
  onShowHelp,
  refreshHint,
  error,
  warning,
  onRetry,
  onMenu,
  emptyTitle,
  emptyBody,
}: MailListProps) {
  const { t } = useI18n()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const selectedOnPage = items.filter((item) => selectedRows.has(mailRowKey(item, activeAccountId)))
  const allSelected = items.length > 0 && selectedOnPage.length === items.length

  const [swipe, setSwipe] = useState<{ key: string; dx: number } | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const touchRef = useRef<{
    key: string
    x: number
    y: number
    horizontal: boolean | null
    swiped: boolean
  } | null>(null)
  const swipeDx = useRef(0)
  const suppressClick = useRef(0)
  const pullStart = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)

  return (
    <section
      className={`mail-list ${selectedOnPage.length > 0 ? 'has-selection' : ''}`}
      aria-label={t('mail.list.aria')}
    >
      <header className="mail-list__head">
        {onMenu ? (
          <button
            type="button"
            className="icon-button mail-list__menu"
            onClick={onMenu}
            aria-label={t('mail.nav.open')}
          >
            <Menu size={18} />
          </button>
        ) : null}
        {items.length > 0 ? (
          <label className="mail-list__select-all" title={t('mail.selectAllTitle')}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onSelectAll}
              aria-label={t('mail.selectAllAria')}
            />
          </label>
        ) : null}
        <div className="mail-list__heading">
          <h1>{title}</h1>
          <p>
            {subtitle ? `${subtitle} · ` : ''}
            {total > 0 ? t('mail.count', { count: total }) : t('mail.none')}
          </p>
        </div>
        {refreshHint ? <span className="mail-list__refresh-hint">{refreshHint}</span> : null}
        {canMarkAllRead ? (
          <button
            type="button"
            className="button button--soft button--sm mail-list__mark-read"
            onClick={onMarkAllRead}
            disabled={markingAllRead || unreadCount === 0}
            title={t('mail.markAllReadTitle')}
          >
            {markingAllRead ? (
              <Loader2 size={14} className="is-spinning" />
            ) : (
              <MailCheck size={14} />
            )}
            <span>
              {unreadCount > 0
                ? t('mail.markAllReadCount', { count: unreadCount })
                : t('mail.markAllRead')}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          className="icon-button"
          onClick={onShowHelp}
          title={t('mail.shortcutsTitle')}
          aria-label={t('mail.shortcutsAria')}
        >
          <Keyboard size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onRefresh}
          title={
            refreshHint ? t('mail.refreshTitle', { hint: refreshHint }) : t('mail.refreshAria')
          }
          aria-label={t('mail.refreshAria')}
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
          placeholder={unified ? t('mail.searchAll') : t('mail.searchFolder')}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label={t('mail.searchAria')}
        />
        {search ? (
          <button
            type="button"
            className="mail-list__search-clear"
            onClick={() => onSearchChange('')}
            aria-label={t('mail.searchClear')}
          >
            <X size={14} />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>

      {selectedOnPage.length > 0 ? (
        <div className="bulk-bar" role="toolbar" aria-label={t('mail.bulkAria')}>
          <span className="bulk-bar__count">
            {t('mail.bulkSelected', { count: selectedOnPage.length })}
          </span>
          <button type="button" onClick={() => onBulkRead(true)} disabled={bulkBusy}>
            {t('mail.row.markRead')}
          </button>
          <button type="button" onClick={() => onBulkRead(false)} disabled={bulkBusy}>
            {t('mail.row.markUnread')}
          </button>
          {canBulkArchive ? (
            <button type="button" onClick={onBulkArchive} disabled={bulkBusy}>
              {t('mail.row.archive')}
            </button>
          ) : null}
          <button
            type="button"
            className="bulk-bar__danger"
            onClick={onBulkDelete}
            disabled={bulkBusy}
          >
            {t('mail.row.delete')}
          </button>
          <button
            type="button"
            className="bulk-bar__clear"
            onClick={onClearSelection}
            disabled={bulkBusy}
          >
            {t('mail.bulkClear')}
          </button>
          {bulkBusy ? <Loader2 size={14} className="is-spinning" /> : null}
        </div>
      ) : null}

      <div
        className="mail-list__body"
        onTouchStart={(event) => {
          if (event.currentTarget.scrollTop > 0) return
          const touch = event.touches[0]
          pullStart.current = touch ? touch.clientY : null
          pullDistanceRef.current = 0
        }}
        onTouchMove={(event) => {
          if (pullStart.current === null) return
          if (event.currentTarget.scrollTop > 0) {
            pullDistanceRef.current = 0
            setPullDistance(0)
            return
          }
          const touch = event.touches[0]
          if (!touch) return
          const distance = touch.clientY - pullStart.current
          const next = distance > 0 ? Math.min(70, distance * 0.5) : 0
          pullDistanceRef.current = next
          setPullDistance(next)
        }}
        onTouchEnd={() => {
          if (pullDistanceRef.current >= 50) onRefresh()
          pullStart.current = null
          pullDistanceRef.current = 0
          setPullDistance(0)
        }}
        onTouchCancel={() => {
          pullStart.current = null
          pullDistanceRef.current = 0
          setPullDistance(0)
        }}
      >
        {pullDistance > 0 ? (
          <div className="mail-list__pull" style={{ height: pullDistance }}>
            {pullDistance >= 50 ? t('mail.pullRelease') : t('mail.pullHint')}
          </div>
        ) : null}
        {loading ? <SkeletonRows /> : null}

        {!loading && warning && !error ? (
          <div className="mail-list__warning" role="status">
            <AlertTriangle size={14} />
            <span>{warning}</span>
          </div>
        ) : null}

        {!loading && error && items.length > 0 ? (
          <div className="mail-list__error-banner" role="alert">
            <AlertTriangle size={14} />
            <span>{t('mail.refreshFailed', { error })}</span>
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
            <h3>{t('mail.error.title')}</h3>
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
            <h3>{emptyTitle ?? (search ? t('mail.emptySearchTitle') : t('mail.empty.title'))}</h3>
            <p>{emptyBody ?? (search ? t('mail.emptySearchBody') : t('mail.emptyNewBody'))}</p>
          </div>
        ) : null}

        {!loading
          ? items.map((item) => {
              const sender = item.from[0]
              // UIDs are only unique inside a mailbox, and the starred view
              // merges several folders, so the folder is part of the key.
              const rowKey = mailRowKey(item, activeAccountId)
              const selected = rowKey === selectedKey
              const checked = selectedRows.has(rowKey)
              const swiping = swipe?.key === rowKey ? swipe.dx : 0
              return (
                // biome-ignore lint/a11y/useSemanticElements: the row contains action buttons, so a button element would nest interactive controls
                <div
                  key={rowKey}
                  className={`mail-row ${selected ? 'is-selected' : ''} ${
                    checked ? 'is-checked' : ''
                  } ${item.unread ? 'is-unread' : ''} ${
                    swiping < 0 ? 'is-swiping-left' : swiping > 0 ? 'is-swiping-right' : ''
                  }`}
                  style={
                    swiping !== 0
                      ? { transform: `translateX(${swiping}px)`, transition: 'none' }
                      : undefined
                  }
                  role="button"
                  tabIndex={0}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => {
                    if (Date.now() - suppressClick.current < 350) return
                    onSelect(item)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(item)
                    }
                  }}
                  onTouchStart={(event) => {
                    const touch = event.touches[0]
                    if (!touch) return
                    touchRef.current = {
                      key: rowKey,
                      x: touch.clientX,
                      y: touch.clientY,
                      horizontal: null,
                      swiped: false,
                    }
                  }}
                  onTouchMove={(event) => {
                    const start = touchRef.current
                    const touch = event.touches[0]
                    if (!start || start.key !== rowKey || !touch) return
                    const dx = touch.clientX - start.x
                    const dy = touch.clientY - start.y
                    if (start.horizontal === null) {
                      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
                      start.horizontal = Math.abs(dx) > Math.abs(dy) + 4
                    }
                    if (!start.horizontal) return
                    if (Math.abs(dx) > 12) start.swiped = true
                    const clamped = Math.max(-96, Math.min(96, dx))
                    swipeDx.current = clamped
                    setSwipe({ key: rowKey, dx: clamped })
                  }}
                  onTouchEnd={() => {
                    const start = touchRef.current
                    touchRef.current = null
                    setSwipe(null)
                    if (!start || start.key !== rowKey || !start.swiped) return
                    suppressClick.current = Date.now()
                    const dx = swipeDx.current
                    swipeDx.current = 0
                    if (dx <= -72) {
                      if (canArchive) onArchive(item)
                      else onDelete(item)
                    } else if (dx >= 72) {
                      onStar(item)
                    }
                  }}
                  onTouchCancel={() => {
                    touchRef.current = null
                    swipeDx.current = 0
                    setSwipe(null)
                  }}
                >
                  {swiping !== 0 ? (
                    <span
                      className={`mail-row__swipe-hint ${swiping < 0 ? 'is-left' : 'is-right'}`}
                    >
                      {swiping < 0
                        ? canArchive
                          ? t('mail.row.archive')
                          : t('mail.row.delete')
                        : item.starred
                          ? t('mail.row.unstar')
                          : t('mail.row.star')}
                    </span>
                  ) : null}
                  <span className="mail-row__check">
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleSelect(item, event.shiftKey)
                      }}
                      aria-label={checked ? t('mail.row.deselect') : t('mail.row.select')}
                    />
                  </span>
                  <span
                    className={`mail-row__status ${item.unread ? 'is-unread' : 'is-read'}`}
                    title={item.unread ? t('mail.row.unread') : t('mail.row.read')}
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
                        {sender ? displayAddress(sender) : t('mail.row.unknownSender')}
                      </span>
                      <span className="mail-row__date">{formatListDate(item.date)}</span>
                    </div>
                    <div className="mail-row__subject">
                      {item.subject.trim() || t('mail.row.noSubject')}
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
                          <Paperclip size={12} /> {t('mail.row.attachment')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mail-row__actions">
                    <button
                      type="button"
                      className="row-action"
                      title={item.unread ? t('mail.row.markRead') : t('mail.row.markUnread')}
                      aria-label={item.unread ? t('mail.row.markRead') : t('mail.row.markUnread')}
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
                      title={item.starred ? t('mail.row.unstar') : t('mail.row.starHint')}
                      aria-label={item.starred ? t('mail.row.unstar') : t('mail.row.star')}
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
                      title={t('mail.row.deleteAria')}
                      aria-label={t('mail.row.deleteAria')}
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

      {total > pageSize ? (
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
