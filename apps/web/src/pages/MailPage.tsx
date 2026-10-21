import type {
  AccountDto,
  MailboxDto,
  MessageDetailDto,
  MessagePageDto,
  MessageSummaryDto,
} from '@osm/shared'
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Plus, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AccountDialog } from '@/components/AccountDialog'
import { type ComposeMode, Composer } from '@/components/Composer'
import { Logo } from '@/components/Logo'
import { MailList, type MailListItem } from '@/components/MailList'
import { MessageReader } from '@/components/MessageReader'
import { folderLabel, Sidebar } from '@/components/Sidebar'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'

const DEFAULT_MAILBOX = 'INBOX'

interface FlagVars {
  accountId: string
  mailbox: string
  uid: number
  seen?: boolean
  flagged?: boolean
  wasUnread: boolean
  wasStarred: boolean
}

interface ComposeState {
  mode: ComposeMode
  source?: MessageDetailDto
  key: string
}

function withFlags(flags: string[], update: { seen?: boolean; flagged?: boolean }): string[] {
  const next = new Set(flags)
  if (update.seen === true) next.add('\\Seen')
  if (update.seen === false) next.delete('\\Seen')
  if (update.flagged === true) next.add('\\Flagged')
  if (update.flagged === false) next.delete('\\Flagged')
  return [...next]
}

function pickMailbox(mailboxes: MailboxDto[]): string {
  const inbox = mailboxes.find((item) => item.specialUse === '\\Inbox' || item.path === 'INBOX')
  return inbox?.path ?? mailboxes[0]?.path ?? DEFAULT_MAILBOX
}

export function MailPage() {
  const { user, config, preferences, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const searchRef = useRef<HTMLInputElement>(null)

  const accountParam = params.get('account') ?? 'all'
  const mailboxParam = params.get('mailbox') ?? DEFAULT_MAILBOX
  const uidParam = Number(params.get('uid')) || null
  const openAccountParam = params.get('openAccount')
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = params.get('q') ?? ''
  const unified = accountParam === 'all'

  const [searchInput, setSearchInput] = useState(query)
  const [compose, setCompose] = useState<ComposeState | null>(null)
  const previousPageSize = useRef(preferences.pageSize)
  const [addOpen, setAddOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) next.delete(key)
            else next.set(key, value)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<AccountDto[]>('/accounts'),
    staleTime: 60_000,
  })
  const accounts = accountsQuery.data ?? []
  const activeAccount = accounts.find((account) => account.id === accountParam) ?? null

  const refreshMs = preferences.refreshSeconds > 0 ? preferences.refreshSeconds * 1000 : false

  const mailboxQueries = useQueries({
    queries: accounts.map((account) => ({
      queryKey: ['mailboxes', account.id],
      queryFn: () => api.get<MailboxDto[]>(`/accounts/${account.id}/mailboxes`),
      staleTime: 45_000,
      refetchInterval: refreshMs,
    })),
  })

  const accountUnread = useMemo(() => {
    const result: Record<string, number> = {}
    accounts.forEach((account, index) => {
      const mailboxes = mailboxQueries[index]?.data ?? []
      const inbox = mailboxes.find((item) => item.specialUse === '\\Inbox' || item.path === 'INBOX')
      result[account.id] = inbox?.unread ?? 0
    })
    return result
  }, [accounts, mailboxQueries])

  const activeIndex = accounts.findIndex((account) => account.id === accountParam)
  const activeMailboxes = activeIndex >= 0 ? (mailboxQueries[activeIndex]?.data ?? []) : []

  // Fix stale / unknown account values, and open the first account on a fresh visit.
  useEffect(() => {
    if (accountsQuery.isLoading) return
    if (!params.get('account') && accounts[0]) {
      update({
        account: preferences.defaultView === 'unified' ? 'all' : accounts[0].id,
        mailbox: DEFAULT_MAILBOX,
        uid: null,
        openAccount: null,
        page: null,
      })
      return
    }
    if (accountParam !== 'all' && !accounts.some((account) => account.id === accountParam)) {
      update({
        account: accounts[0]?.id ?? 'all',
        mailbox: DEFAULT_MAILBOX,
        uid: null,
        openAccount: null,
        page: null,
      })
    }
  }, [accounts, accountsQuery.isLoading, accountParam, params, preferences.defaultView, update])

  useEffect(() => {
    if (!activeAccount || activeMailboxes.length === 0) return
    if (!activeMailboxes.some((mailbox) => mailbox.path === mailboxParam)) {
      update({ mailbox: pickMailbox(activeMailboxes), uid: null })
    }
  }, [activeAccount, activeMailboxes, mailboxParam, update])

  const messagesQuery = useQuery({
    queryKey: ['messages', accountParam, mailboxParam, page, preferences.pageSize, query],
    queryFn: () =>
      api.get<MessagePageDto>(
        `/accounts/${accountParam}/messages?mailbox=${encodeURIComponent(mailboxParam)}&page=${page}&pageSize=${preferences.pageSize}${
          query ? `&q=${encodeURIComponent(query)}` : ''
        }`,
      ),
    enabled: !unified && Boolean(activeAccount),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: refreshMs,
  })

  const unifiedQueries = useQueries({
    queries: accounts.map((account) => ({
      queryKey: ['messages', account.id, DEFAULT_MAILBOX, 1, preferences.pageSize, query],
      queryFn: () =>
        api.get<MessagePageDto>(
          `/accounts/${account.id}/messages?mailbox=${DEFAULT_MAILBOX}&page=1&pageSize=${preferences.pageSize}${
            query ? `&q=${encodeURIComponent(query)}` : ''
          }`,
        ),
      enabled: unified,
      staleTime: 15_000,
      refetchInterval: unified ? refreshMs : false,
    })),
  })

  const unifiedItems: MailListItem[] = useMemo(() => {
    if (!unified) return []
    const items: MailListItem[] = []
    accounts.forEach((account, index) => {
      const data = unifiedQueries[index]?.data
      if (!data) return
      for (const message of data.messages) {
        items.push({
          ...message,
          accountId: account.id,
          accountName: account.name,
          accountColor: account.color,
        })
      }
    })
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [accounts, unified, unifiedQueries])

  const items: MailListItem[] = unified ? unifiedItems : (messagesQuery.data?.messages ?? [])
  const listLoading = unified
    ? unifiedQueries.some((result) => result.isLoading)
    : messagesQuery.isLoading
  const listFetching = unified
    ? unifiedQueries.some((result) => result.isFetching)
    : messagesQuery.isFetching
  const total = unified
    ? unifiedQueries.reduce((sum, result) => sum + (result.data?.total ?? 0), 0)
    : (messagesQuery.data?.total ?? 0)

  const detailAccountId = unified ? openAccountParam : accountParam
  const detailMailbox = unified ? DEFAULT_MAILBOX : mailboxParam
  const detailQuery = useQuery({
    queryKey: ['message', detailAccountId, detailMailbox, uidParam],
    queryFn: () =>
      api.get<MessageDetailDto>(
        `/accounts/${detailAccountId}/messages/${uidParam}?mailbox=${encodeURIComponent(
          detailMailbox,
        )}`,
      ),
    enabled: Boolean(uidParam && detailAccountId),
    staleTime: 30_000,
  })

  const detailAccountIndex = accounts.findIndex((account) => account.id === detailAccountId)
  const detailMailboxes =
    detailAccountIndex >= 0 ? (mailboxQueries[detailAccountIndex]?.data ?? []) : []
  const archivePath =
    detailMailboxes.find(
      (mailbox) =>
        mailbox.specialUse === '\\Archive' || /^(archive|all mail|归档)$/i.test(mailbox.name),
    )?.path ?? null
  const readerAccount = accounts.find((account) => account.id === detailAccountId) ?? null

  const flagsMutation = useMutation({
    mutationFn: (vars: FlagVars) =>
      api.post(
        `/accounts/${vars.accountId}/messages/${vars.uid}/flags?mailbox=${encodeURIComponent(
          vars.mailbox,
        )}`,
        { seen: vars.seen, flagged: vars.flagged },
      ),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['messages', vars.accountId] })
      queryClient.setQueriesData<MessagePageDto>(
        { queryKey: ['messages', vars.accountId] },
        (old) => {
          if (!old || old.mailbox !== vars.mailbox) return old
          return {
            ...old,
            messages: old.messages.map((message) =>
              message.uid === vars.uid
                ? {
                    ...message,
                    unread: vars.seen === undefined ? message.unread : !vars.seen,
                    starred: vars.flagged === undefined ? message.starred : vars.flagged,
                    flags: withFlags(message.flags, vars),
                  }
                : message,
            ),
          }
        },
      )
      queryClient.setQueryData<MessageDetailDto>(
        ['message', vars.accountId, vars.mailbox, vars.uid],
        (old) =>
          old
            ? {
                ...old,
                unread: vars.seen === undefined ? old.unread : !vars.seen,
                starred: vars.flagged === undefined ? old.starred : vars.flagged,
                flags: withFlags(old.flags, vars),
              }
            : old,
      )
      if (vars.seen !== undefined) {
        queryClient.setQueriesData<MailboxDto[]>(
          { queryKey: ['mailboxes', vars.accountId] },
          (old) =>
            old?.map((mailbox) => {
              if (mailbox.path !== vars.mailbox) return mailbox
              const delta = vars.seen ? (vars.wasUnread ? -1 : 0) : vars.wasUnread ? 0 : 1
              return { ...mailbox, unread: Math.max(0, mailbox.unread + delta) }
            }),
        )
      }
    },
    onError: (error) => {
      toast.error('操作失败', errorMessage(error))
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (vars: { accountId: string; mailbox: string; uid: number }) =>
      api.delete(
        `/accounts/${vars.accountId}/messages/${vars.uid}?mailbox=${encodeURIComponent(
          vars.mailbox,
        )}`,
      ),
    onSuccess: (_result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['messages', vars.accountId] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes', vars.accountId] })
      if (uidParam === vars.uid) update({ uid: null, openAccount: null })
      toast.success('邮件已删除', '已移动到废纸篓（如果服务器提供）')
    },
    onError: (error) => toast.error('删除失败', errorMessage(error)),
  })

  const moveMutation = useMutation({
    mutationFn: (vars: { accountId: string; mailbox: string; uid: number; destination: string }) =>
      api.post(`/accounts/${vars.accountId}/messages/${vars.uid}/move`, {
        mailbox: vars.mailbox,
        destination: vars.destination,
      }),
    onSuccess: (_result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['messages', vars.accountId] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes', vars.accountId] })
      if (uidParam === vars.uid) update({ uid: null, openAccount: null })
      toast.success('邮件已归档')
    },
    onError: (error) => toast.error('归档失败', errorMessage(error)),
  })

  function selectAccount(accountId: string | null) {
    setSidebarOpen(false)
    update({
      account: accountId ?? 'all',
      mailbox: DEFAULT_MAILBOX,
      uid: null,
      openAccount: null,
      page: null,
      q: null,
    })
  }

  function selectMailbox(path: string) {
    setSidebarOpen(false)
    update({ mailbox: path, uid: null, openAccount: null, page: null })
  }

  function selectMessage(item: MailListItem) {
    const accountId = item.accountId ?? activeAccount?.id
    if (!accountId) return
    const mailbox = item.accountId ? DEFAULT_MAILBOX : mailboxParam
    update({
      uid: String(item.uid),
      ...(item.accountId ? { openAccount: item.accountId } : {}),
    })
    if (item.unread && preferences.autoMarkRead) {
      flagsMutation.mutate({
        accountId,
        mailbox,
        uid: item.uid,
        seen: true,
        wasUnread: true,
        wasStarred: item.starred,
      })
    }
  }

  function starMessage(item: MessageSummaryDto, accountId: string, mailbox: string) {
    flagsMutation.mutate({
      accountId,
      mailbox,
      uid: item.uid,
      flagged: !item.starred,
      wasUnread: item.unread,
      wasStarred: item.starred,
    })
  }

  function toggleRead(item: MessageSummaryDto, accountId: string, mailbox: string) {
    flagsMutation.mutate({
      accountId,
      mailbox,
      uid: item.uid,
      seen: item.unread,
      wasUnread: item.unread,
      wasStarred: item.starred,
    })
  }

  function removeItem(item: MessageSummaryDto, accountId: string, mailbox: string) {
    deleteMutation.mutate({ accountId, mailbox, uid: item.uid })
  }

  function archiveMessage(message: MessageDetailDto, accountId: string, destination: string) {
    if (message.mailbox === destination) return
    moveMutation.mutate({
      accountId,
      mailbox: message.mailbox,
      uid: message.uid,
      destination,
    })
  }

  function openCompose(mode: ComposeMode, source?: MessageDetailDto) {
    setCompose({
      mode,
      source,
      key: `${mode}-${source?.uid ?? 'new'}-${Date.now()}`,
    })
  }

  function refresh() {
    if (unified) queryClient.invalidateQueries({ queryKey: ['messages'] })
    else queryClient.invalidateQueries({ queryKey: ['messages', accountParam] })
    queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
  }

  useEffect(() => {
    setSearchInput(query)
  }, [query])

  useEffect(() => {
    if (previousPageSize.current === preferences.pageSize) return
    previousPageSize.current = preferences.pageSize
    update({ page: null, uid: null })
  }, [preferences.pageSize, update])

  useEffect(() => {
    if (searchInput === query) return
    const timer = window.setTimeout(() => {
      update({ q: searchInput.trim() || null, page: null, uid: null })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchInput, query, update])

  const currentMailbox = activeMailboxes.find((mailbox) => mailbox.path === mailboxParam)
  const listTitle = unified
    ? '全部收件箱'
    : currentMailbox
      ? folderLabel(currentMailbox)
      : mailboxParam
  const listSubtitle = unified
    ? accounts.length > 1
      ? `${accounts.length} 个账户`
      : undefined
    : activeAccount?.email

  const selectedKey = uidParam
    ? `${unified ? (openAccountParam ?? 'all') : accountParam}:${uidParam}`
    : null

  useEffect(() => {
    const subject = detailQuery.data?.subject?.trim()
    const siteName = config?.siteName ?? 'OpenSimpleMail'
    document.title = subject ? `${subject} · ${siteName}` : `${listTitle} · ${siteName}`
  }, [config?.siteName, detailQuery.data?.subject, listTitle])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (compose || addOpen) return

      if (event.key === 'c') {
        event.preventDefault()
        if (accounts.length === 0) setAddOpen(true)
        else openCompose('new')
        return
      }
      if (event.key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (event.key === 'j' || event.key === 'k') {
        if (items.length === 0) return
        event.preventDefault()
        const currentIndex = items.findIndex(
          (item) => `${item.accountId ?? activeAccount?.id}:${item.uid}` === selectedKey,
        )
        const nextIndex =
          currentIndex === -1
            ? 0
            : Math.min(items.length - 1, Math.max(0, currentIndex + (event.key === 'j' ? 1 : -1)))
        const next = items[nextIndex]
        if (next) selectMessage(next)
        return
      }
      if (event.key === 'r' && detailQuery.data) {
        event.preventDefault()
        openCompose('reply', detailQuery.data)
        return
      }
      if (event.key === 'Escape' && uidParam) {
        update({ uid: null, openAccount: null })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!user) return null

  const noAccounts = !accountsQuery.isLoading && accounts.length === 0
  const reading = Boolean(uidParam)

  return (
    <div
      className={`app-shell ${reading ? 'is-reading' : ''} ${
        sidebarOpen ? 'is-sidebar-open' : ''
      } ${preferences.density === 'compact' ? 'app-shell--compact' : ''}`}
    >
      <Sidebar
        user={user}
        accounts={accounts}
        activeAccountId={activeAccount?.id ?? null}
        activeMailbox={mailboxParam}
        mailboxes={activeMailboxes}
        accountUnread={accountUnread}
        onSelectAccount={selectAccount}
        onSelectMailbox={selectMailbox}
        onCompose={() => {
          if (accounts.length === 0) setAddOpen(true)
          else openCompose('new')
        }}
        onAddAccount={() => {
          setSidebarOpen(false)
          setAddOpen(true)
        }}
        onSettings={() => {
          navigate('/settings')
        }}
        onLogout={() => {
          void logout()
        }}
      />
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="关闭导航"
        onClick={() => setSidebarOpen(false)}
      />

      {noAccounts ? (
        <div className="workspace-empty">
          <div className="workspace-empty__inner">
            <span className="workspace-empty__mark">
              <Logo compact />
            </span>
            <p className="eyebrow">GET STARTED</p>
            <h1>先连接一个邮箱</h1>
            <p>
              使用 IMAP / SMTP 接入 Gmail、Outlook、QQ 邮箱或你自己的邮件服务器。
              也可以先用演示邮箱随便逛逛。
            </p>
            <div className="workspace-empty__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => setAddOpen(true)}
              >
                <Plus size={17} /> 添加邮箱账户
              </button>
            </div>
            <p className="workspace-empty__hint">
              <Sparkles size={14} /> 推荐为 Gmail / QQ 邮箱生成应用专用密码，而不是使用登录密码。
            </p>
          </div>
        </div>
      ) : (
        <>
          <MailList
            title={listTitle}
            subtitle={listSubtitle}
            items={items}
            loading={listLoading}
            refreshing={listFetching}
            selectedKey={selectedKey}
            total={total}
            page={page}
            pageSize={preferences.pageSize}
            unified={unified}
            search={searchInput}
            searchRef={searchRef}
            onSearchChange={setSearchInput}
            onSelect={selectMessage}
            onStar={(item) => {
              const accountId = item.accountId ?? activeAccount?.id
              if (!accountId) return
              starMessage(item, accountId, item.accountId ? DEFAULT_MAILBOX : mailboxParam)
            }}
            onDelete={(item) => {
              const accountId = item.accountId ?? activeAccount?.id
              if (!accountId) return
              removeItem(item, accountId, item.accountId ? DEFAULT_MAILBOX : mailboxParam)
            }}
            onPage={(nextPage) => update({ page: String(nextPage), uid: null })}
            onRefresh={refresh}
            refreshHint={
              preferences.refreshSeconds > 0
                ? `每 ${preferences.refreshSeconds} 秒自动刷新`
                : '自动刷新已关闭'
            }
            onMenu={() => setSidebarOpen(true)}
            emptyTitle={unified && accounts.length > 0 ? '收件箱是空的' : undefined}
            emptyBody={
              query
                ? '换一个关键词试试，或者切换到其他文件夹。'
                : '新邮件会出现在这里。点击左上角「写邮件」开始。'
            }
          />

          <MessageReader
            account={readerAccount}
            message={detailQuery.data ?? null}
            defaultAllowImages={preferences.loadRemoteImages}
            loading={Boolean(uidParam) && detailQuery.isLoading}
            archivePath={archivePath}
            onClose={() => update({ uid: null, openAccount: null })}
            onReply={(message) => openCompose('reply', message)}
            onForward={(message) => openCompose('forward', message)}
            onStar={(message) => {
              if (!detailAccountId) return
              starMessage(message, detailAccountId, message.mailbox)
            }}
            onDelete={(message) => {
              if (!detailAccountId) return
              removeItem(message, detailAccountId, message.mailbox)
            }}
            onToggleRead={(message) => {
              if (!detailAccountId) return
              toggleRead(message, detailAccountId, message.mailbox)
            }}
            onArchive={(message, destination) => {
              if (!detailAccountId) return
              archiveMessage(message, detailAccountId, destination)
            }}
          />
        </>
      )}

      {compose ? (
        <Composer
          key={compose.key}
          open
          mode={compose.mode}
          accounts={accounts}
          defaultAccountId={
            detailAccountId && compose.mode !== 'new'
              ? detailAccountId
              : (activeAccount?.id ?? accounts[0]?.id ?? null)
          }
          source={compose.source}
          onClose={() => setCompose(null)}
          onSent={(accountId) => {
            queryClient.invalidateQueries({ queryKey: ['messages', accountId] })
            queryClient.invalidateQueries({ queryKey: ['mailboxes', accountId] })
          }}
        />
      ) : null}

      <AccountDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={(account) => {
          queryClient.invalidateQueries({ queryKey: ['accounts'] })
          queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
          update({
            account: account.id,
            mailbox: DEFAULT_MAILBOX,
            uid: null,
            openAccount: null,
            page: null,
            q: null,
          })
        }}
      />
    </div>
  )
}
