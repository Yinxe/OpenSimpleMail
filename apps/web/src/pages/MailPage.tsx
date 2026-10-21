import {
  type AccountDto,
  type MailboxDto,
  type MessageDetailDto,
  type MessagePageDto,
  type MessageSummaryDto,
  STARRED_MAILBOX,
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
import { Composer } from '@/components/Composer'
import { DeleteMessageDialog } from '@/components/DeleteMessageDialog'
import { Logo } from '@/components/Logo'
import { MailList, type MailListItem, mailRowKey } from '@/components/MailList'
import { MessageReader } from '@/components/MessageReader'
import { folderLabel, Sidebar } from '@/components/Sidebar'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { isDeleteConfirmSkipped, setDeleteConfirmSkipped } from '@/lib/deleteGuard'
import type { ComposeMode } from '@/lib/drafts'
import { displayAddress } from '@/lib/format'
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

interface DeleteTarget {
  accountId: string
  mailbox: string
  uid: number
  subject: string
  sender: string
}

interface ComposeState {
  mode: ComposeMode
  source?: MessageDetailDto
  key: string
}

interface BulkTarget {
  accountId: string
  mailbox: string
  uids: number[]
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

/**
 * Resolve where a delete will put the message. `known` stays false while the
 * account's folder list is still loading, so the dialog does not claim the
 * delete is permanent before it knows whether a trash folder exists.
 */
function deleteDestination(
  accounts: AccountDto[],
  mailboxQueries: { data?: MailboxDto[] }[],
  target: DeleteTarget | null,
): { label: string | null; known: boolean } {
  if (!target) return { label: null, known: false }
  const index = accounts.findIndex((account) => account.id === target.accountId)
  if (index < 0) return { label: null, known: false }
  const mailboxes = mailboxQueries[index]?.data
  if (!mailboxes) return { label: null, known: false }
  const trash = mailboxes.find(
    (mailbox) =>
      mailbox.specialUse === '\\Trash' ||
      /^(trash|deleted items|已删除|废纸篓)$/i.test(mailbox.name),
  )
  if (!trash || trash.path === target.mailbox) return { label: null, known: true }
  return { label: folderLabel(trash), known: true }
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
  const openMailboxParam = params.get('openMailbox')
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = params.get('q') ?? ''
  const unified = accountParam === 'all'
  const starred = mailboxParam === STARRED_MAILBOX

  const [searchInput, setSearchInput] = useState(query)
  const [compose, setCompose] = useState<ComposeState | null>(null)
  const previousPageSize = useRef(preferences.pageSize)
  const [addOpen, setAddOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const selectionAnchor = useRef<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null)
  const [keepDeleteConfirm, setKeepDeleteConfirm] = useState(true)
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false)

  useEffect(() => {
    setSkipDeleteConfirm(isDeleteConfirmSkipped(user?.id))
  }, [user?.id])

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setPendingDelete(null)
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
        // Keep an explicit mailbox from a shared link (including the starred view).
        mailbox: params.get('mailbox') ?? DEFAULT_MAILBOX,
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
    if (starred) return
    if (!activeAccount || activeMailboxes.length === 0) return
    if (!activeMailboxes.some((mailbox) => mailbox.path === mailboxParam)) {
      update({ mailbox: pickMailbox(activeMailboxes), uid: null })
    }
  }, [activeAccount, activeMailboxes, mailboxParam, starred, update])

  // Selection belongs to the current folder/page/search, not to the message view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the selection when the list context changes
  useEffect(() => {
    setSelectedRows(new Set())
    selectionAnchor.current = null
  }, [accountParam, mailboxParam, page, query])

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

  const unifiedMailbox = starred ? STARRED_MAILBOX : DEFAULT_MAILBOX
  const unifiedQueries = useQueries({
    queries: accounts.map((account) => ({
      queryKey: ['messages', account.id, unifiedMailbox, 1, preferences.pageSize, query],
      queryFn: () =>
        api.get<MessagePageDto>(
          `/accounts/${account.id}/messages?mailbox=${encodeURIComponent(
            unifiedMailbox,
          )}&page=1&pageSize=${preferences.pageSize}${
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

  const listError = unified
    ? (unifiedQueries.find((result) => result.isError)?.error ?? null)
    : (messagesQuery.error ?? null)

  function retryList() {
    if (unified) {
      for (const result of unifiedQueries) {
        if (result.isError) void result.refetch()
      }
      return
    }
    void messagesQuery.refetch()
  }

  const detailAccountId = unified ? openAccountParam : accountParam
  const selectedItem = uidParam
    ? items.find(
        (item) => item.uid === uidParam && (!unified || item.accountId === detailAccountId),
      )
    : undefined
  const detailMailbox =
    openMailboxParam ?? selectedItem?.mailbox ?? (unified ? unifiedMailbox : mailboxParam)
  const detailQuery = useQuery({
    queryKey: ['message', detailAccountId, detailMailbox, uidParam],
    queryFn: () =>
      api.get<MessageDetailDto>(
        `/accounts/${detailAccountId}/messages/${uidParam}?mailbox=${encodeURIComponent(
          detailMailbox,
        )}`,
      ),
    enabled: Boolean(uidParam && detailAccountId && detailMailbox !== STARRED_MAILBOX),
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
          if (!old) return old
          const apply = (message: MessageSummaryDto): MessageSummaryDto => ({
            ...message,
            unread: vars.seen === undefined ? message.unread : !vars.seen,
            starred: vars.flagged === undefined ? message.starred : vars.flagged,
            flags: withFlags(message.flags, vars),
          })

          if (old.mailbox === STARRED_MAILBOX) {
            const target = old.messages.find(
              (message) => message.uid === vars.uid && message.mailbox === vars.mailbox,
            )
            if (!target) return old
            // Un-starring from the starred view removes the row immediately.
            if (vars.flagged === false) {
              return {
                ...old,
                messages: old.messages.filter((message) => message !== target),
                total: Math.max(0, old.total - 1),
              }
            }
            return {
              ...old,
              messages: old.messages.map((message) =>
                message === target ? apply(message) : message,
              ),
            }
          }

          if (old.mailbox !== vars.mailbox) return old
          return {
            ...old,
            messages: old.messages.map((message) =>
              message.uid === vars.uid ? apply(message) : message,
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
    onSuccess: (_data, vars) => {
      if (vars.flagged === undefined) return
      // A new star must show up in the starred view; an unstar was already
      // removed optimistically, so this only refreshes the total.
      queryClient.invalidateQueries({
        queryKey: ['messages', vars.accountId],
        predicate: (result) => result.queryKey[2] === STARRED_MAILBOX,
      })
      queryClient.invalidateQueries({ queryKey: ['mailboxes', vars.accountId] })
    },
    onError: (error) => {
      toast.error('操作失败', errorMessage(error))
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (vars: { accountId: string; mailbox: string; uid: number }) =>
      api.delete<{ movedTo?: string }>(
        `/accounts/${vars.accountId}/messages/${vars.uid}?mailbox=${encodeURIComponent(
          vars.mailbox,
        )}`,
      ),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['messages', vars.accountId] })
      const previous = queryClient.getQueriesData<MessagePageDto>({
        queryKey: ['messages', vars.accountId],
      })
      queryClient.setQueriesData<MessagePageDto>(
        { queryKey: ['messages', vars.accountId] },
        (old) => {
          if (!old) return old
          if (old.mailbox !== vars.mailbox && old.mailbox !== STARRED_MAILBOX) return old
          const messages = old.messages.filter(
            (message) =>
              !(
                message.uid === vars.uid &&
                (old.mailbox !== STARRED_MAILBOX || message.mailbox === vars.mailbox)
              ),
          )
          if (messages.length === old.messages.length) return old
          return { ...old, messages, total: Math.max(0, old.total - 1) }
        },
      )
      return { previous }
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['messages', vars.accountId] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes', vars.accountId] })
      if (
        uidParam === vars.uid &&
        detailAccountId === vars.accountId &&
        detailMailbox === vars.mailbox
      ) {
        update({ uid: null, openAccount: null, openMailbox: null })
      }
      const movedTo = result?.movedTo
      const accountIndex = accounts.findIndex((account) => account.id === vars.accountId)
      const movedFolder = movedTo
        ? (mailboxQueries[accountIndex]?.data ?? []).find((item) => item.path === movedTo)
        : undefined
      const movedLabel = movedTo ? (movedFolder ? folderLabel(movedFolder) : movedTo) : null
      toast.success(
        '邮件已删除',
        movedLabel ? `已移动到「${movedLabel}」` : '服务器没有废纸篓，已永久删除',
      )
    },
    onError: (error, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data)
      }
      toast.error('删除失败', errorMessage(error))
    },
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
      if (
        uidParam === vars.uid &&
        detailAccountId === vars.accountId &&
        detailMailbox === vars.mailbox
      ) {
        update({ uid: null, openAccount: null, openMailbox: null })
      }
      toast.success('邮件已归档')
    },
    onError: (error) => toast.error('归档失败', errorMessage(error)),
  })

  const markAllReadMutation = useMutation({
    mutationFn: async (targets: { accountId: string; mailbox: string }[]) => {
      await Promise.all(
        targets.map((target) =>
          api.post(`/accounts/${target.accountId}/mailboxes/read`, {
            mailbox: target.mailbox,
          }),
        ),
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
      toast.success('已全部标为已读')
    },
    onError: (error) => {
      toast.error('标记失败', errorMessage(error))
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
    },
  })

  function markAllRead() {
    if (starred) return
    const targets = unified
      ? accounts.map((account) => ({ accountId: account.id, mailbox: DEFAULT_MAILBOX }))
      : activeAccount
        ? [{ accountId: activeAccount.id, mailbox: mailboxParam }]
        : []
    if (targets.length > 0) markAllReadMutation.mutate(targets)
  }

  function selectAccount(accountId: string | null) {
    setSidebarOpen(false)
    update({
      account: accountId ?? 'all',
      // The unified entry always opens the unified inbox; switching between
      // accounts keeps the starred view the user is currently in.
      mailbox: accountId !== null && starred ? STARRED_MAILBOX : DEFAULT_MAILBOX,
      uid: null,
      openAccount: null,
      openMailbox: null,
      page: null,
      q: null,
    })
  }

  function selectMailbox(path: string) {
    setSidebarOpen(false)
    update({ mailbox: path, uid: null, openAccount: null, openMailbox: null, page: null })
  }

  function selectStarred() {
    setSidebarOpen(false)
    update({
      mailbox: STARRED_MAILBOX,
      uid: null,
      openAccount: null,
      openMailbox: null,
      page: null,
      q: null,
    })
  }

  function mailboxOf(item: MailListItem): string {
    return item.mailbox ?? (item.accountId || starred ? DEFAULT_MAILBOX : mailboxParam)
  }

  function rowKeyOf(item: MailListItem): string {
    return mailRowKey(item, activeAccount?.id ?? null)
  }

  function toggleSelect(item: MailListItem, shiftKey: boolean) {
    const key = rowKeyOf(item)
    setSelectedRows((current) => {
      const next = new Set(current)
      const anchor = selectionAnchor.current
      if (shiftKey && anchor) {
        const from = items.findIndex((candidate) => rowKeyOf(candidate) === anchor)
        const to = items.findIndex((candidate) => rowKeyOf(candidate) === key)
        if (from >= 0 && to >= 0) {
          const [start, end] = from <= to ? [from, to] : [to, from]
          for (let index = start; index <= end; index += 1) {
            const candidate = items[index]
            if (candidate) next.add(rowKeyOf(candidate))
          }
          return next
        }
      }
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    selectionAnchor.current = key
  }

  function toggleSelectAll() {
    if (items.length === 0) return
    const keys = items.map(rowKeyOf)
    const allSelected = keys.every((key) => selectedRows.has(key))
    setSelectedRows(allSelected ? new Set() : new Set(keys))
    selectionAnchor.current = null
  }

  function clearSelection() {
    setSelectedRows(new Set())
    selectionAnchor.current = null
  }

  function bulkTargets(): BulkTarget[] {
    const groups = new Map<string, BulkTarget>()
    for (const item of items) {
      if (!selectedRows.has(rowKeyOf(item))) continue
      const accountId = item.accountId ?? activeAccount?.id
      if (!accountId) continue
      const mailbox = item.mailbox ?? mailboxParam
      const key = `${accountId}:${mailbox}`
      const group = groups.get(key) ?? { accountId, mailbox, uids: [] }
      group.uids.push(item.uid)
      groups.set(key, group)
    }
    return [...groups.values()]
  }

  function archiveMailboxFor(accountId: string): string | null {
    const index = accounts.findIndex((account) => account.id === accountId)
    const mailboxes = index >= 0 ? (mailboxQueries[index]?.data ?? []) : []
    return (
      mailboxes.find(
        (mailbox) =>
          mailbox.specialUse === '\\Archive' || /^(archive|all mail|归档)$/i.test(mailbox.name),
      )?.path ?? null
    )
  }

  async function runBulk(operation: 'read' | 'unread' | 'archive' | 'delete') {
    const targets = bulkTargets()
    const count = targets.reduce((sum, target) => sum + target.uids.length, 0)
    if (count === 0) return
    if (operation === 'delete' && !window.confirm(`删除选中的 ${count} 封邮件？`)) return

    let affected = count
    setBulkBusy(true)
    try {
      if (operation === 'read' || operation === 'unread') {
        const seen = operation === 'read'
        await Promise.all(
          targets.map((target) =>
            api.post(`/accounts/${target.accountId}/messages/bulk/flags`, {
              mailbox: target.mailbox,
              uids: target.uids,
              seen,
            }),
          ),
        )
      } else if (operation === 'archive') {
        const moves: { target: BulkTarget; destination: string }[] = []
        for (const target of targets) {
          const destination = archiveMailboxFor(target.accountId)
          if (destination && destination !== target.mailbox) {
            moves.push({ target, destination })
          }
        }
        if (moves.length === 0) {
          toast.error('无法归档', '当前账户没有可用的归档文件夹')
          return
        }
        affected = moves.reduce((sum, move) => sum + move.target.uids.length, 0)
        await Promise.all(
          moves.map(({ target, destination }) =>
            api.post(`/accounts/${target.accountId}/messages/bulk/move`, {
              mailbox: target.mailbox,
              uids: target.uids,
              destination,
            }),
          ),
        )
      } else {
        await Promise.all(
          targets.map((target) =>
            api.post(`/accounts/${target.accountId}/messages/bulk/delete`, {
              mailbox: target.mailbox,
              uids: target.uids,
            }),
          ),
        )
      }

      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
      if (
        (operation === 'delete' || operation === 'archive') &&
        selectedKey &&
        selectedRows.has(selectedKey)
      ) {
        update({ uid: null, openAccount: null, openMailbox: null })
      }
      clearSelection()
      toast.success(
        operation === 'delete'
          ? `已删除 ${affected} 封邮件`
          : operation === 'archive'
            ? `已归档 ${affected} 封邮件`
            : `已更新 ${affected} 封邮件`,
      )
    } catch (error) {
      toast.error('批量操作失败', errorMessage(error))
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
    } finally {
      setBulkBusy(false)
    }
  }

  function selectMessage(item: MailListItem) {
    const accountId = item.accountId ?? activeAccount?.id
    if (!accountId) return
    const mailbox = mailboxOf(item)
    update({
      uid: String(item.uid),
      ...(item.accountId ? { openAccount: item.accountId } : {}),
      openMailbox: mailbox,
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
    if (item.starred && starred) {
      toast.info('已取消收藏', '这封邮件已从收藏中移除')
    }
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

  function requestDelete(target: DeleteTarget) {
    if (skipDeleteConfirm) {
      deleteMutation.mutate({
        accountId: target.accountId,
        mailbox: target.mailbox,
        uid: target.uid,
      })
      return
    }
    setKeepDeleteConfirm(true)
    setPendingDelete(target)
  }

  function confirmDelete() {
    if (!pendingDelete) return
    if (user && !keepDeleteConfirm) {
      setDeleteConfirmSkipped(user.id, true)
      setSkipDeleteConfirm(true)
    }
    deleteMutation.mutate({
      accountId: pendingDelete.accountId,
      mailbox: pendingDelete.mailbox,
      uid: pendingDelete.uid,
    })
    setPendingDelete(null)
  }

  function removeItem(item: MessageSummaryDto, accountId: string, mailbox: string) {
    requestDelete({
      accountId,
      mailbox,
      uid: item.uid,
      subject: item.subject,
      sender: item.from[0] ? displayAddress(item.from[0]) : '',
    })
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
  const listTitle = starred
    ? unified
      ? '全部收藏'
      : '收藏'
    : unified
      ? '全部收件箱'
      : currentMailbox
        ? folderLabel(currentMailbox)
        : mailboxParam
  const listSubtitle = starred
    ? unified
      ? accounts.length > 1
        ? `${accounts.length} 个账户 · 稍后处理`
        : '稍后处理'
      : activeAccount?.email
    : unified
      ? accounts.length > 1
        ? `${accounts.length} 个账户`
        : undefined
      : activeAccount?.email

  const starredCount = useMemo(() => {
    if (accounts.length === 0) return undefined
    const totals = accounts.map(
      (_account, index) =>
        (mailboxQueries[index]?.data ?? []).find((item) => item.specialUse === '\\Flagged')?.total,
    )
    if (totals.some((total) => total === undefined)) return undefined
    return totals.reduce<number>((sum, total) => sum + (total ?? 0), 0)
  }, [accounts, mailboxQueries])

  const selectedKey = uidParam
    ? `${unified ? (openAccountParam ?? 'all') : accountParam}:${
        detailQuery.data?.uid === uidParam ? detailQuery.data.mailbox : detailMailbox
      }:${uidParam}`
    : null

  const unreadCount = unified
    ? accounts.reduce((sum, account) => sum + (accountUnread[account.id] ?? 0), 0)
    : (currentMailbox?.unread ?? 0)
  const canMarkAllRead = !starred && (unified ? accounts.length > 0 : Boolean(activeAccount))
  const canBulkArchive = unified
    ? accounts.some((account) => archiveMailboxFor(account.id) !== null)
    : archiveMailboxFor(activeAccount?.id ?? '') !== null

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
      if (compose || addOpen || pendingDelete) return

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
          (item) =>
            `${item.accountId ?? activeAccount?.id}:${item.mailbox ?? detailMailbox}:${item.uid}` ===
            selectedKey,
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
      if (event.key === 'a' && detailQuery.data) {
        event.preventDefault()
        openCompose('replyAll', detailQuery.data)
        return
      }
      if (event.key === 'Escape') {
        if (selectedRows.size > 0) {
          clearSelection()
          return
        }
        if (uidParam) update({ uid: null, openAccount: null, openMailbox: null })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!user) return null

  const noAccounts = !accountsQuery.isLoading && accounts.length === 0
  const reading = Boolean(uidParam)
  const pendingDestination = deleteDestination(accounts, mailboxQueries, pendingDelete)

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
        starredCount={starredCount}
        onSelectAccount={selectAccount}
        onSelectMailbox={selectMailbox}
        onSelectStarred={selectStarred}
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
            activeAccountId={activeAccount?.id ?? null}
            selectedRows={selectedRows}
            onToggleSelect={toggleSelect}
            onSelectAll={toggleSelectAll}
            onClearSelection={clearSelection}
            onBulkRead={(seen) => void runBulk(seen ? 'read' : 'unread')}
            onBulkArchive={() => void runBulk('archive')}
            onBulkDelete={() => void runBulk('delete')}
            bulkBusy={bulkBusy}
            canBulkArchive={canBulkArchive}
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
              starMessage(item, accountId, mailboxOf(item))
            }}
            onToggleRead={(item) => {
              const accountId = item.accountId ?? activeAccount?.id
              if (!accountId) return
              toggleRead(item, accountId, mailboxOf(item))
            }}
            onDelete={(item) => {
              const accountId = item.accountId ?? activeAccount?.id
              if (!accountId) return
              removeItem(item, accountId, mailboxOf(item))
            }}
            onPage={(nextPage) => update({ page: String(nextPage), uid: null })}
            onRefresh={refresh}
            unreadCount={unreadCount}
            onMarkAllRead={markAllRead}
            markingAllRead={markAllReadMutation.isPending}
            canMarkAllRead={canMarkAllRead}
            error={listError ? errorMessage(listError) : null}
            onRetry={retryList}
            refreshHint={
              preferences.refreshSeconds > 0
                ? `每 ${preferences.refreshSeconds} 秒自动刷新`
                : '自动刷新已关闭'
            }
            onMenu={() => setSidebarOpen(true)}
            emptyTitle={
              query
                ? undefined
                : starred
                  ? '还没有收藏的邮件'
                  : unified && accounts.length > 0
                    ? '收件箱是空的'
                    : undefined
            }
            emptyBody={
              query
                ? '换一个关键词试试，或者切换到其他文件夹。'
                : starred
                  ? '在列表或阅读器里点击星标即可收藏，收藏的邮件会集中出现在这里，方便稍后处理。'
                  : '新邮件会出现在这里。点击左上角「写邮件」开始。'
            }
          />

          <MessageReader
            account={readerAccount}
            message={detailQuery.data ?? null}
            defaultAllowImages={preferences.loadRemoteImages}
            loading={Boolean(uidParam) && detailQuery.isLoading}
            archivePath={archivePath}
            onClose={() => update({ uid: null, openAccount: null, openMailbox: null })}
            onReply={(message) => openCompose('reply', message)}
            onReplyAll={(message) => openCompose('replyAll', message)}
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

      <DeleteMessageDialog
        open={Boolean(pendingDelete)}
        subject={pendingDelete?.subject ?? ''}
        sender={pendingDelete?.sender ?? ''}
        destinationLabel={pendingDestination.label}
        destinationKnown={pendingDestination.known}
        keepConfirm={keepDeleteConfirm}
        busy={deleteMutation.isPending}
        onKeepConfirmChange={setKeepDeleteConfirm}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
