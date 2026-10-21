import {
  type AccountDto,
  type MailboxDto,
  type MessageDetailDto,
  type MessagePageDto,
  type MessageSummaryDto,
  type MoveOutcomeDto,
  STARRED_MAILBOX,
  type UnifiedMessagePageDto,
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
import { FolderDialog } from '@/components/FolderDialog'
import { Logo } from '@/components/Logo'
import { MailList, type MailListItem, mailRowKey } from '@/components/MailList'
import { MessageReader } from '@/components/MessageReader'
import { Modal } from '@/components/Modal'
import { folderLabel, Sidebar } from '@/components/Sidebar'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { isDeleteConfirmSkipped, setDeleteConfirmSkipped } from '@/lib/deleteGuard'
import type { ComposeMode } from '@/lib/drafts'
import { displayAddress } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/locales'
import { useToast } from '@/lib/toast'
import { useNewMailNotifications, useUnreadBadge } from '@/lib/unread'

const DEFAULT_MAILBOX = 'INBOX'

/** A reverse move that puts messages back where they were before archive/delete. */
interface UndoMoveGroup {
  accountId: string
  from: string
  to: string
  uids: number[]
}

const SHORTCUTS: { keys: string[]; labelKey: MessageKey }[] = [
  { keys: ['c'], labelKey: 'shortcuts.compose' },
  { keys: ['/'], labelKey: 'shortcuts.search' },
  { keys: ['j'], labelKey: 'shortcuts.next' },
  { keys: ['k'], labelKey: 'shortcuts.prev' },
  { keys: ['r'], labelKey: 'shortcuts.reply' },
  { keys: ['a'], labelKey: 'shortcuts.replyAll' },
  { keys: ['f'], labelKey: 'shortcuts.forward' },
  { keys: ['s'], labelKey: 'shortcuts.star' },
  { keys: ['u'], labelKey: 'shortcuts.read' },
  { keys: ['e'], labelKey: 'shortcuts.archive' },
  { keys: ['#'], labelKey: 'shortcuts.delete' },
  { keys: ['x'], labelKey: 'shortcuts.select' },
  { keys: ['g', 'i'], labelKey: 'shortcuts.inbox' },
  { keys: ['Esc'], labelKey: 'shortcuts.clear' },
  { keys: ['?'], labelKey: 'shortcuts.help' },
]

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
  draftSource?: MessageDetailDto
  draftAccountId?: string
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
  t?: (key: MessageKey, vars?: Record<string, string | number>) => string,
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
  return { label: folderLabel(trash, t), known: true }
}

export function MailPage() {
  const { user, config, preferences, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useI18n()
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
  const [helpOpen, setHelpOpen] = useState(false)
  const [folderDialog, setFolderDialog] = useState<{
    mode: 'create' | 'rename'
    folder?: MailboxDto
  } | null>(null)
  const [folderBusy, setFolderBusy] = useState(false)
  const goPrefix = useRef<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null)
  const [keepDeleteConfirm, setKeepDeleteConfirm] = useState(true)

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

  const totalUnread = useMemo(
    () => accounts.reduce((sum, account) => sum + (accountUnread[account.id] ?? 0), 0),
    [accounts, accountUnread],
  )
  const notificationsReady =
    accountsQuery.isSuccess && mailboxQueries.every((query) => query.isSuccess)

  useUnreadBadge(totalUnread)
  useNewMailNotifications({
    count: totalUnread,
    enabled: preferences.desktopNotifications,
    ready: notificationsReady,
    siteName: config?.siteName ?? 'OpenSimpleMail',
    onOpen: () => navigate('/app'),
  })

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
  const unifiedQuery = useQuery({
    queryKey: ['messages', 'unified', unifiedMailbox, page, preferences.pageSize, query],
    queryFn: () =>
      api.get<UnifiedMessagePageDto>(
        `/messages/unified?mailbox=${encodeURIComponent(unifiedMailbox)}&page=${page}&pageSize=${
          preferences.pageSize
        }${query ? `&q=${encodeURIComponent(query)}` : ''}`,
      ),
    enabled: unified,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: refreshMs,
  })

  const items: MailListItem[] = unified
    ? (unifiedQuery.data?.messages ?? [])
    : (messagesQuery.data?.messages ?? [])
  const listLoading = unified ? unifiedQuery.isLoading : messagesQuery.isLoading
  const listFetching = unified ? unifiedQuery.isFetching : messagesQuery.isFetching
  const total = unified ? (unifiedQuery.data?.total ?? 0) : (messagesQuery.data?.total ?? 0)

  const listError = unified ? (unifiedQuery.error ?? null) : (messagesQuery.error ?? null)
  const failedAccounts = unified ? (unifiedQuery.data?.failedAccounts ?? 0) : 0
  const listWarning =
    failedAccounts > 0 ? t('mail.failedAccounts', { count: failedAccounts }) : null

  function retryList() {
    if (unified) {
      void unifiedQuery.refetch()
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
      toast.error(t('mail.actionFailed'), errorMessage(error))
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
    },
  })

  const undoMoveMutation = useMutation({
    mutationFn: async (groups: UndoMoveGroup[]) => {
      for (const group of groups) {
        await api.post(`/accounts/${group.accountId}/messages/bulk/move`, {
          mailbox: group.from,
          uids: group.uids,
          destination: group.to,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
      toast.success(t('mail.undone'))
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
      toast.error(t('mail.undoFailed'), errorMessage(error))
    },
  })

  /** Build the reverse move for an archive/delete, when the server reported UIDs. */
  function undoGroupsFrom(
    accountId: string,
    originalMailbox: string,
    outcome: MoveOutcomeDto | null | undefined,
  ): UndoMoveGroup[] {
    if (!outcome?.movedTo || !outcome.uidMap?.length) return []
    const uids = outcome.uidMap.map((pair) => pair.to).filter((uid) => Number.isFinite(uid))
    if (uids.length === 0) return []
    return [{ accountId, from: outcome.movedTo, to: originalMailbox, uids }]
  }

  function undoAction(groups: UndoMoveGroup[]): { label: string; onClick: () => void } | undefined {
    if (groups.length === 0) return undefined
    return { label: t('mail.undo'), onClick: () => undoMoveMutation.mutate(groups) }
  }

  const deleteMutation = useMutation({
    mutationFn: (vars: { accountId: string; mailbox: string; uid: number }) =>
      api.delete<MoveOutcomeDto>(
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
      const movedLabel = movedTo ? (movedFolder ? folderLabel(movedFolder, t) : movedTo) : null
      const undo = undoGroupsFrom(vars.accountId, vars.mailbox, result)
      toast.success(
        t('mail.deleted'),
        movedLabel ? t('mail.movedTo', { folder: movedLabel }) : t('mail.deletedPermanently'),
        undoAction(undo),
      )
    },
    onError: (error, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data)
      }
      toast.error(t('mail.deleteFailed'), errorMessage(error))
    },
  })

  const moveMutation = useMutation({
    mutationFn: (vars: { accountId: string; mailbox: string; uid: number; destination: string }) =>
      api.post<MoveOutcomeDto>(`/accounts/${vars.accountId}/messages/${vars.uid}/move`, {
        mailbox: vars.mailbox,
        destination: vars.destination,
      }),
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
      toast.success(
        t('mail.archived'),
        undefined,
        undoAction(undoGroupsFrom(vars.accountId, vars.mailbox, result)),
      )
    },
    onError: (error) => toast.error(t('mail.archiveFailed'), errorMessage(error)),
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
      toast.success(t('mail.allRead'))
    },
    onError: (error) => {
      toast.error(t('mail.markFailed'), errorMessage(error))
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

  function openCreateFolder() {
    if (!activeAccount) return
    setFolderDialog({ mode: 'create' })
  }

  function openRenameFolder(folder: MailboxDto) {
    setFolderDialog({ mode: 'rename', folder })
  }

  async function submitFolder(path: string) {
    if (!activeAccount || !folderDialog) return
    setFolderBusy(true)
    try {
      if (folderDialog.mode === 'create') {
        await api.post(`/accounts/${activeAccount.id}/mailboxes`, { mailbox: path })
        toast.success(t('mail.folderCreated'), path)
      } else if (folderDialog.folder) {
        await api.patch(`/accounts/${activeAccount.id}/mailboxes`, {
          path: folderDialog.folder.path,
          newPath: path,
        })
        toast.success(t('mail.folderRenamed'), path)
      }
      queryClient.invalidateQueries({ queryKey: ['mailboxes', activeAccount.id] })
      setFolderDialog(null)
    } catch (error) {
      toast.error(t('mail.folderFailed'), errorMessage(error))
    } finally {
      setFolderBusy(false)
    }
  }

  async function deleteFolder(folder: MailboxDto) {
    if (!activeAccount) return
    if (!window.confirm(t('mail.folderDeleteConfirm', { folder: folderLabel(folder, t) }))) return
    setFolderBusy(true)
    try {
      await api.delete(
        `/accounts/${activeAccount.id}/mailboxes?mailbox=${encodeURIComponent(folder.path)}`,
      )
      queryClient.invalidateQueries({ queryKey: ['mailboxes', activeAccount.id] })
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      if (mailboxParam === folder.path) {
        update({ mailbox: DEFAULT_MAILBOX, uid: null, page: null })
      }
      toast.success(t('mail.folderDeleted'), folderLabel(folder, t))
    } catch (error) {
      toast.error(t('mail.folderDeleteFailed'), errorMessage(error))
    } finally {
      setFolderBusy(false)
    }
  }

  async function emptyFolder(folder: MailboxDto) {
    if (!activeAccount) return
    if (!window.confirm(t('mail.folderEmptyConfirm', { folder: folderLabel(folder, t) }))) return
    setFolderBusy(true)
    try {
      await api.post(`/accounts/${activeAccount.id}/mailboxes/empty`, {
        mailbox: folder.path,
      })
      queryClient.invalidateQueries({ queryKey: ['mailboxes', activeAccount.id] })
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      toast.success(t('mail.folderEmptied'), folderLabel(folder, t))
    } catch (error) {
      toast.error(t('mail.folderEmptyFailed'), errorMessage(error))
    } finally {
      setFolderBusy(false)
    }
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

  function isDraftMailbox(accountId: string, mailbox: string): boolean {
    const index = accounts.findIndex((account) => account.id === accountId)
    const list = index >= 0 ? (mailboxQueries[index]?.data ?? []) : []
    const found = list.find((item) => item.path === mailbox)
    if (found) return found.specialUse === '\\Drafts' || /^(drafts|草稿箱?)$/i.test(found.name)
    return /^(drafts|草稿箱?)$/i.test(mailbox)
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
    if (operation === 'delete' && !window.confirm(t('mail.bulkDeleteConfirm', { count }))) return

    let affected = count
    const undoGroups: UndoMoveGroup[] = []
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
          toast.error(t('mail.cannotArchive'), t('mail.noArchiveFolder'))
          return
        }
        affected = moves.reduce((sum, move) => sum + move.target.uids.length, 0)
        const outcomes = await Promise.all(
          moves.map(async ({ target, destination }) => ({
            target,
            outcome: await api.post<MoveOutcomeDto>(
              `/accounts/${target.accountId}/messages/bulk/move`,
              {
                mailbox: target.mailbox,
                uids: target.uids,
                destination,
              },
            ),
          })),
        )
        for (const entry of outcomes) {
          undoGroups.push(
            ...undoGroupsFrom(entry.target.accountId, entry.target.mailbox, entry.outcome),
          )
        }
      } else {
        const outcomes = await Promise.all(
          targets.map(async (target) => ({
            target,
            outcome: await api.post<MoveOutcomeDto>(
              `/accounts/${target.accountId}/messages/bulk/delete`,
              {
                mailbox: target.mailbox,
                uids: target.uids,
              },
            ),
          })),
        )
        for (const entry of outcomes) {
          undoGroups.push(
            ...undoGroupsFrom(entry.target.accountId, entry.target.mailbox, entry.outcome),
          )
        }
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
          ? t('mail.bulkDeleted', { count: affected })
          : operation === 'archive'
            ? t('mail.bulkArchived', { count: affected })
            : t('mail.bulkUpdated', { count: affected }),
        undefined,
        operation === 'delete' || operation === 'archive' ? undoAction(undoGroups) : undefined,
      )
    } catch (error) {
      toast.error(t('mail.bulkFailed'), errorMessage(error))
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
      toast.info(t('mail.unstarred'), t('mail.unstarredBody'))
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
    if (isDeleteConfirmSkipped(user?.id, target.accountId)) {
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
      // Scoped to this account, so another mailbox still asks first.
      setDeleteConfirmSkipped(user.id, true, pendingDelete.accountId)
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

  function editDraft(message: MessageDetailDto, accountId: string) {
    setCompose({
      mode: 'new',
      draftSource: message,
      draftAccountId: accountId,
      key: `draft-${message.uid}-${Date.now()}`,
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
      ? t('mail.starredTitle')
      : t('folder.starred')
    : unified
      ? t('settings.viewUnified')
      : currentMailbox
        ? folderLabel(currentMailbox, t)
        : mailboxParam
  const listSubtitle = starred
    ? unified
      ? accounts.length > 1
        ? `${t('mail.accountsCount', { count: accounts.length })} · ${t('mail.laterTitle')}`
        : t('mail.laterTitle')
      : activeAccount?.email
    : unified
      ? accounts.length > 1
        ? t('mail.accountsCount', { count: accounts.length })
        : undefined
      : activeAccount?.email

  // Servers without a `\Flagged` folder (QQ Mail, for example) report nothing
  // here, so the open starred view falls back to the count the list already has.
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
    const unreadPrefix = totalUnread > 0 ? `(${totalUnread}) ` : ''
    document.title = `${unreadPrefix}${
      subject ? `${subject} · ${siteName}` : `${listTitle} · ${siteName}`
    }`
  }, [config?.siteName, detailQuery.data?.subject, listTitle, totalUnread])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      if (event.key === '?') {
        event.preventDefault()
        setHelpOpen((open) => !open)
        return
      }
      if (compose || addOpen || pendingDelete || helpOpen) return

      if (event.key === 'g') {
        goPrefix.current = Date.now()
        return
      }
      if (event.key === 'i' && goPrefix.current && Date.now() - goPrefix.current < 1500) {
        goPrefix.current = null
        event.preventDefault()
        update({
          mailbox: DEFAULT_MAILBOX,
          uid: null,
          openAccount: null,
          openMailbox: null,
          page: null,
        })
        return
      }
      goPrefix.current = null

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

      const message = detailQuery.data
      if (message && detailAccountId) {
        if (event.key === 'r') {
          event.preventDefault()
          openCompose('reply', message)
          return
        }
        if (event.key === 'a') {
          event.preventDefault()
          openCompose('replyAll', message)
          return
        }
        if (event.key === 'f') {
          event.preventDefault()
          openCompose('forward', message)
          return
        }
        if (event.key === 's') {
          event.preventDefault()
          starMessage(message, detailAccountId, message.mailbox)
          return
        }
        if (event.key === 'u') {
          event.preventDefault()
          toggleRead(message, detailAccountId, message.mailbox)
          return
        }
        if (event.key === 'e' && archivePath) {
          event.preventDefault()
          archiveMessage(message, detailAccountId, archivePath)
          return
        }
        if (event.key === '#') {
          event.preventDefault()
          removeItem(message, detailAccountId, message.mailbox)
          return
        }
      }

      if (event.key === 'x' && selectedKey) {
        const item = items.find((candidate) => rowKeyOf(candidate) === selectedKey)
        if (item) {
          event.preventDefault()
          toggleSelect(item, false)
          return
        }
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
  const pendingDestination = deleteDestination(accounts, mailboxQueries, pendingDelete, t)

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
        starredCount={starredCount ?? (starred ? total : undefined)}
        onSelectAccount={selectAccount}
        onSelectMailbox={selectMailbox}
        onSelectStarred={selectStarred}
        onCreateFolder={openCreateFolder}
        onRenameFolder={openRenameFolder}
        onDeleteFolder={(folder) => void deleteFolder(folder)}
        onEmptyFolder={(folder) => void emptyFolder(folder)}
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
        aria-label={t('mail.closeNav')}
        onClick={() => setSidebarOpen(false)}
      />

      {noAccounts ? (
        <div className="workspace-empty">
          <div className="workspace-empty__inner">
            <span className="workspace-empty__mark">
              <Logo compact />
            </span>
            <p className="eyebrow">GET STARTED</p>
            <h1>{t('mail.onboardingTitle')}</h1>
            <p>{t('mail.onboardingBody')}</p>
            <div className="workspace-empty__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => setAddOpen(true)}
              >
                <Plus size={17} /> {t('mail.addAccount')}
              </button>
            </div>
            <p className="workspace-empty__hint">
              <Sparkles size={14} /> {t('mail.appPasswordHint')}
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
            onArchive={(item) => {
              const accountId = item.accountId ?? activeAccount?.id
              if (!accountId) return
              const destination = archiveMailboxFor(accountId)
              const mailbox = mailboxOf(item)
              if (!destination || destination === mailbox) {
                toast.error(t('mail.cannotArchive'), t('mail.noArchiveFolder'))
                return
              }
              moveMutation.mutate({ accountId, mailbox, uid: item.uid, destination })
            }}
            canArchive={canBulkArchive}
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
            onShowHelp={() => setHelpOpen(true)}
            error={listError ? errorMessage(listError) : null}
            warning={listWarning}
            onRetry={retryList}
            refreshHint={
              preferences.refreshSeconds > 0
                ? t('mail.autoRefresh', { seconds: preferences.refreshSeconds })
                : t('mail.autoRefreshOff')
            }
            onMenu={() => setSidebarOpen(true)}
            emptyTitle={
              query
                ? undefined
                : starred
                  ? t('mail.emptyStarred')
                  : unified && accounts.length > 0
                    ? t('mail.emptyInbox')
                    : undefined
            }
            emptyBody={
              query
                ? t('mail.emptySearchHint')
                : starred
                  ? t('mail.emptyStarredHint')
                  : t('mail.emptyInboxHint')
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
            isDraft={Boolean(detailAccountId && isDraftMailbox(detailAccountId, detailMailbox))}
            onEditDraft={(message) => {
              if (!detailAccountId) return
              editDraft(message, detailAccountId)
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
            compose.draftAccountId
              ? compose.draftAccountId
              : detailAccountId && compose.mode !== 'new'
                ? detailAccountId
                : (activeAccount?.id ?? accounts[0]?.id ?? null)
          }
          source={compose.source}
          draftSource={compose.draftSource}
          draftAccountId={compose.draftAccountId}
          onClose={() => setCompose(null)}
          onSent={(accountId) => {
            queryClient.invalidateQueries({ queryKey: ['messages', accountId] })
            queryClient.invalidateQueries({ queryKey: ['mailboxes', accountId] })
          }}
        />
      ) : null}

      <FolderDialog
        open={Boolean(folderDialog)}
        mode={folderDialog?.mode ?? 'create'}
        initialPath={folderDialog?.mode === 'rename' ? folderDialog.folder?.path : ''}
        busy={folderBusy}
        onClose={() => setFolderDialog(null)}
        onSubmit={(path) => void submitFolder(path)}
      />

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

      <Modal
        open={helpOpen}
        title={t('shortcuts.title')}
        subtitle={t('shortcuts.subtitle')}
        onClose={() => setHelpOpen(false)}
      >
        <div className="shortcut-list">
          {SHORTCUTS.map((shortcut) => (
            <div className="shortcut-row" key={shortcut.labelKey}>
              <span className="shortcut-keys">
                {shortcut.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
              <span className="shortcut-label">{t(shortcut.labelKey)}</span>
            </div>
          ))}
        </div>
      </Modal>

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
