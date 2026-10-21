import {
  type AccountDto,
  type AttachmentCacheStatsDto,
  DEFAULT_PREFERENCES,
  type SystemSettingsDto,
  type TestResultDto,
  type UpdateSystemSettingsPayload,
  type UserPreferencesDto,
} from '@osm/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  FlaskConical,
  HardDrive,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AccountDialog } from '@/components/AccountDialog'
import { Avatar } from '@/components/Avatar'
import { Logo } from '@/components/Logo'
import { Modal } from '@/components/Modal'
import { SecurityCard } from '@/components/SecurityCard'
import { Spinner } from '@/components/Spinner'
import { ThemeToggle } from '@/components/ThemeToggle'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { isDeleteConfirmSkipped, setDeleteConfirmSkipped } from '@/lib/deleteGuard'
import { formatBytes } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/locales'
import { type ThemeChoice, useTheme } from '@/lib/theme'
import { useToast } from '@/lib/toast'

const THEME_OPTIONS: {
  value: ThemeChoice
  labelKey: MessageKey
  descKey: MessageKey
  icon: typeof Sun
}[] = [
  {
    value: 'light',
    labelKey: 'settings.themeLight',
    descKey: 'settings.themeLightDesc',
    icon: Sun,
  },
  { value: 'dark', labelKey: 'settings.themeDark', descKey: 'settings.themeDarkDesc', icon: Moon },
  {
    value: 'system',
    labelKey: 'settings.themeSystem',
    descKey: 'settings.themeSystemDesc',
    icon: Monitor,
  },
]

export function SettingsPage() {
  const { user, config, preferences, logout, refreshConfig, updatePreferences } = useAuth()
  const { locale, setLocale, t } = useI18n()
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AccountDto | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [adminForm, setAdminForm] = useState({
    siteName: 'OpenSimpleMail',
    allowRegistration: false,
    demoEnabled: true,
  })
  const [prefForm, setPrefForm] = useState<UserPreferencesDto>(preferences)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false)
  const [clearCacheOpen, setClearCacheOpen] = useState(false)

  useEffect(() => {
    setSkipDeleteConfirm(isDeleteConfirmSkipped(user?.id))
  }, [user?.id])

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<AccountDto[]>('/accounts'),
  })

  const adminQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get<SystemSettingsDto>('/admin/settings'),
    enabled: Boolean(user?.isAdmin),
  })

  useEffect(() => {
    setPrefForm(preferences)
  }, [preferences])

  useEffect(() => {
    if (!adminQuery.data) return
    setAdminForm({
      siteName: adminQuery.data.siteName,
      allowRegistration: adminQuery.data.allowRegistration,
      demoEnabled: adminQuery.data.demoEnabled,
    })
  }, [adminQuery.data])

  const adminMutation = useMutation({
    mutationFn: (payload: UpdateSystemSettingsPayload) =>
      api.patch<SystemSettingsDto>('/admin/settings', payload),
    onSuccess: (data) => {
      setAdminForm({
        siteName: data.siteName,
        allowRegistration: data.allowRegistration,
        demoEnabled: data.demoEnabled,
      })
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
      void refreshConfig()
      toast.success(t('settings.toastSystemSaved'))
    },
    onError: (error) => toast.error(t('settings.toastSystemFailed'), errorMessage(error)),
  })

  const attachmentCache = useQuery({
    queryKey: ['admin-attachments'],
    queryFn: () => api.get<AttachmentCacheStatsDto>('/admin/attachments'),
    enabled: Boolean(user?.isAdmin),
  })

  const clearCacheMutation = useMutation({
    mutationFn: () => api.delete<AttachmentCacheStatsDto>('/admin/attachments'),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin-attachments'], data)
      setClearCacheOpen(false)
      toast.success(t('settings.toastCacheCleared'))
    },
    onError: (error) => toast.error(t('settings.toastCacheFailed'), errorMessage(error)),
  })

  useEffect(() => {
    document.title = `${t('settings.title')} · ${config?.siteName ?? 'OpenSimpleMail'}`
  }, [config?.siteName, t])

  const deleteMutation = useMutation({
    mutationFn: (accountId: string) => api.delete(`/accounts/${accountId}`),
    onSuccess: (_result, accountId) => {
      const account = accountsQuery.data?.find((item) => item.id === accountId)
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      toast.success(t('settings.toastAccountRemoved'), account?.email)
    },
    onError: (error) => toast.error(t('settings.toastRemoveFailed'), errorMessage(error)),
  })

  async function testAccount(account: AccountDto) {
    setTestingId(account.id)
    try {
      const result = await api.post<TestResultDto>(`/accounts/${account.id}/test`)
      toast.success(
        t('settings.toastConnected'),
        t('settings.toastConnectedBody', { ms: result.durationMs }),
      )
    } catch (error) {
      toast.error(t('settings.toastConnectFailed'), errorMessage(error))
    } finally {
      setTestingId(null)
    }
  }

  function removeAccount(account: AccountDto) {
    const confirmed = window.confirm(
      t('settings.toastRemoveConfirm', { name: account.name, email: account.email }),
    )
    if (confirmed) deleteMutation.mutate(account.id)
  }

  async function savePreferences() {
    setSavingPrefs(true)
    try {
      await updatePreferences(prefForm)
      toast.success(t('settings.toastPrefsSaved'))
    } catch (error) {
      toast.error(t('settings.toastPrefsFailed'), errorMessage(error))
    } finally {
      setSavingPrefs(false)
    }
  }

  async function toggleDesktopNotifications(enabled: boolean) {
    if (!enabled) {
      setPrefForm((current) => ({ ...current, desktopNotifications: false }))
      return
    }
    if (typeof Notification === 'undefined') {
      toast.error(t('settings.toastNoNotifications'))
      return
    }
    try {
      const permission =
        Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error(
          t('settings.toastNotificationDenied'),
          t('settings.toastNotificationDeniedBody'),
        )
        return
      }
      setPrefForm((current) => ({ ...current, desktopNotifications: true }))
    } catch {
      toast.error(t('settings.toastNotificationRequestFailed'))
    }
  }

  if (!user) return null

  const accounts = accountsQuery.data ?? []

  return (
    <div className="settings">
      <header className="settings__topbar">
        <div className="settings__topbar-left">
          <button
            type="button"
            className="button button--ghost button--sm"
            onClick={() => navigate('/app')}
          >
            <ArrowLeft size={16} /> {t('settings.back')}
          </button>
          <Logo />
        </div>
        <ThemeToggle />
      </header>

      <main className="settings__main">
        <div className="settings__intro">
          <p className="eyebrow">WORKSPACE SETTINGS</p>
          <h1>{t('settings.title')}</h1>
          <p>{t('settings.subtitle')}</p>
        </div>

        <section className="settings-card settings-profile">
          <Avatar name={user.name} seed={user.email} size="lg" />
          <div className="settings-profile__body">
            <h2>{user.name}</h2>
            <p>{user.email}</p>
            {user.isDemo ? (
              <span className="badge badge--warm">{t('settings.demoWorkspace')}</span>
            ) : user.isAdmin ? (
              <span className="badge badge--warm">
                <ShieldCheck size={13} /> {t('settings.admin')}
              </span>
            ) : (
              <span className="badge">
                <BadgeCheck size={13} /> {t('settings.localAccount')}
              </span>
            )}
          </div>
          <button
            type="button"
            className="button button--ghost button--sm"
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
          >
            <LogOut size={15} /> {t('settings.logout')}
          </button>
        </section>

        <section className="settings-card">
          <div className="settings-card__head">
            <div>
              <h2>{t('settings.accounts.title')}</h2>
              <p>{t('settings.accounts.subtitle')}</p>
            </div>
            <button
              type="button"
              className="button button--primary button--sm"
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus size={15} /> {t('settings.addAccount')}
            </button>
          </div>

          <div className="account-cards">
            {accountsQuery.isLoading ? (
              <div className="settings-loading">
                <Spinner size={20} /> {t('settings.loadingAccounts')}
              </div>
            ) : null}

            {accounts.map((account) => (
              <article className="account-card" key={account.id}>
                <Avatar name={account.name} seed={account.email} color={account.color} size="md" />
                <div className="account-card__body">
                  <div className="account-card__title">
                    <h3>{account.name}</h3>
                    {account.kind === 'demo' ? (
                      <span className="badge badge--warm">{t('settings.demoBadge')}</span>
                    ) : null}
                  </div>
                  <p className="account-card__email">{account.email}</p>
                  <p className="account-card__servers">
                    {account.kind === 'demo'
                      ? t('settings.demoServer')
                      : `IMAP ${account.imap.host}:${account.imap.port} · SMTP ${account.smtp.host}:${account.smtp.port}`}
                  </p>
                </div>
                <div className="account-card__actions">
                  <button
                    type="button"
                    className="button button--ghost button--sm"
                    onClick={() => testAccount(account)}
                    disabled={testingId === account.id || account.kind === 'demo'}
                  >
                    {testingId === account.id ? <Spinner /> : <FlaskConical size={14} />}
                    {t('settings.test')}
                  </button>
                  {account.kind !== 'demo' ? (
                    <>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => {
                          setEditing(account)
                          setDialogOpen(true)
                        }}
                        title={t('settings.edit')}
                        aria-label={t('settings.edit')}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        onClick={() => removeAccount(account)}
                        title={t('settings.remove')}
                        aria-label={t('settings.remove')}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}

            {!accountsQuery.isLoading && accounts.length === 0 ? (
              <div className="settings-empty">
                <p>{t('settings.noAccounts')}</p>
                <button
                  type="button"
                  className="button button--soft button--sm"
                  onClick={() => {
                    setEditing(null)
                    setDialogOpen(true)
                  }}
                >
                  <Plus size={15} /> {t('settings.addFirstAccount')}
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {user.isAdmin ? (
          <section className="settings-card">
            <div className="settings-card__head">
              <div>
                <h2>{t('settings.adminTitle')}</h2>
                <p>{t('settings.adminSubtitle')}</p>
              </div>
              <span className="badge">
                <Settings2 size={13} /> {t('settings.admin')}
              </span>
            </div>

            <div className="admin-settings">
              <label className="field">
                <span className="field__label">{t('settings.siteName')}</span>
                <input
                  className="input"
                  value={adminForm.siteName}
                  maxLength={60}
                  onChange={(event) =>
                    setAdminForm((current) => ({ ...current, siteName: event.target.value }))
                  }
                  placeholder={t('settings.sitePlaceholder')}
                />
              </label>

              <label className="switch-row">
                <span className="switch-row__text">
                  <strong>{t('settings.allowRegistration')}</strong>
                  <small>
                    {t('settings.allowRegistrationHint')}
                    {adminForm.allowRegistration
                      ? ` ${t('settings.registrationOn')}`
                      : ` ${t('settings.registrationOff')}`}
                  </small>
                </span>
                <input
                  type="checkbox"
                  className="switch"
                  checked={adminForm.allowRegistration}
                  onChange={(event) =>
                    setAdminForm((current) => ({
                      ...current,
                      allowRegistration: event.target.checked,
                    }))
                  }
                />
              </label>

              <label className="switch-row">
                <span className="switch-row__text">
                  <strong>{t('settings.demoEnabled')}</strong>
                  <small>{t('settings.demoEnabledHint')}</small>
                </span>
                <input
                  type="checkbox"
                  className="switch"
                  checked={adminForm.demoEnabled}
                  onChange={(event) =>
                    setAdminForm((current) => ({ ...current, demoEnabled: event.target.checked }))
                  }
                />
              </label>

              <div className="admin-settings__foot">
                <span>{t('settings.applyHint')}</span>
                <button
                  type="button"
                  className="button button--primary button--sm"
                  onClick={() =>
                    adminMutation.mutate({
                      siteName: adminForm.siteName.trim(),
                      allowRegistration: adminForm.allowRegistration,
                      demoEnabled: adminForm.demoEnabled,
                    })
                  }
                  disabled={adminMutation.isPending || !adminForm.siteName.trim()}
                >
                  {adminMutation.isPending ? <Spinner /> : <ShieldCheck size={14} />}
                  {t('settings.saveSystem')}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {user.isAdmin ? (
          <section className="settings-card">
            <div className="settings-card__head">
              <div>
                <h2>{t('settings.cacheTitle')}</h2>
                <p>{t('settings.cacheSubtitle')}</p>
              </div>
              <span className="badge">
                <HardDrive size={13} /> {formatBytes(attachmentCache.data?.diskBytes ?? 0)}
              </span>
            </div>

            <div className="admin-settings">
              <div className="switch-row">
                <span className="switch-row__text">
                  <strong>
                    {attachmentCache.isLoading
                      ? t('settings.cacheLoading')
                      : t('settings.cacheEntries', { count: attachmentCache.data?.entries ?? 0 })}
                  </strong>
                  <small>
                    {t('settings.cacheUsage', {
                      disk: formatBytes(attachmentCache.data?.diskBytes ?? 0),
                      limit: formatBytes(attachmentCache.data?.limitBytes ?? 0),
                      memory: formatBytes(attachmentCache.data?.memoryBytes ?? 0),
                    })}
                  </small>
                </span>
              </div>

              <div className="admin-settings__foot">
                <span>{t('settings.cacheHint')}</span>
                <button
                  type="button"
                  className="button button--ghost button--sm"
                  onClick={() => setClearCacheOpen(true)}
                  disabled={clearCacheMutation.isPending}
                >
                  {clearCacheMutation.isPending ? <Spinner /> : <Trash2 size={14} />}
                  {t('settings.clearCache')}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <SecurityCard />

        <section className="settings-card">
          <div className="settings-card__head">
            <div>
              <h2>{t('settings.preferences.title')}</h2>
              <p>{t('settings.prefsSubtitle')}</p>
            </div>
            <span className="badge">
              <SlidersHorizontal size={13} /> {t('settings.prefsBadge')}
            </span>
          </div>

          <div className="pref-grid">
            <label className="field">
              <span className="field__label">{t('settings.refreshInterval')}</span>
              <select
                className="input"
                value={prefForm.refreshSeconds}
                onChange={(event) =>
                  setPrefForm((current) => ({
                    ...current,
                    refreshSeconds: Number(event.target.value),
                  }))
                }
              >
                <option value={0}>{t('settings.refreshOff')}</option>
                <option value={15}>{t('settings.everySeconds', { count: 15 })}</option>
                <option value={30}>{t('settings.everySeconds', { count: 30 })}</option>
                <option value={60}>{t('settings.everyMinutes', { count: 1 })}</option>
                <option value={300}>{t('settings.everyMinutes', { count: 5 })}</option>
                <option value={600}>{t('settings.everyMinutes', { count: 10 })}</option>
              </select>
            </label>

            <label className="field">
              <span className="field__label">{t('settings.pageSize')}</span>
              <select
                className="input"
                value={prefForm.pageSize}
                onChange={(event) =>
                  setPrefForm((current) => ({
                    ...current,
                    pageSize: Number(event.target.value),
                  }))
                }
              >
                <option value={20}>{t('settings.messagesCount', { count: 20 })}</option>
                <option value={30}>{t('settings.messagesCount', { count: 30 })}</option>
                <option value={50}>{t('settings.messagesCount', { count: 50 })}</option>
                <option value={100}>{t('settings.messagesCount', { count: 100 })}</option>
              </select>
            </label>

            <label className="field">
              <span className="field__label">{t('settings.defaultView')}</span>
              <select
                className="input"
                value={prefForm.defaultView}
                onChange={(event) =>
                  setPrefForm((current) => ({
                    ...current,
                    defaultView: event.target.value as UserPreferencesDto['defaultView'],
                  }))
                }
              >
                <option value="account">{t('settings.viewAccount')}</option>
                <option value="unified">{t('settings.viewUnified')}</option>
              </select>
            </label>

            <label className="field">
              <span className="field__label">{t('settings.density')}</span>
              <select
                className="input"
                value={prefForm.density}
                onChange={(event) =>
                  setPrefForm((current) => ({
                    ...current,
                    density: event.target.value as UserPreferencesDto['density'],
                  }))
                }
              >
                <option value="comfortable">{t('settings.densityComfortable')}</option>
                <option value="compact">{t('settings.densityCompact')}</option>
              </select>
            </label>
          </div>

          <div className="pref-switches">
            <label className="switch-row">
              <span className="switch-row__text">
                <strong>{t('settings.autoRead')}</strong>
                <small>{t('settings.autoReadHint')}</small>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={prefForm.autoMarkRead}
                onChange={(event) =>
                  setPrefForm((current) => ({ ...current, autoMarkRead: event.target.checked }))
                }
              />
            </label>

            <label className="switch-row">
              <span className="switch-row__text">
                <strong>{t('settings.remoteImages')}</strong>
                <small>{t('settings.remoteImagesHint')}</small>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={prefForm.loadRemoteImages}
                onChange={(event) =>
                  setPrefForm((current) => ({
                    ...current,
                    loadRemoteImages: event.target.checked,
                  }))
                }
              />
            </label>

            <label className="switch-row">
              <span className="switch-row__text">
                <strong>{t('settings.desktopNotifications')}</strong>
                <small>{t('settings.desktopNotificationsHint')}</small>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={prefForm.desktopNotifications}
                onChange={(event) => void toggleDesktopNotifications(event.target.checked)}
              />
            </label>
          </div>

          <div className="admin-settings__foot">
            <span>{t('settings.refreshHint')}</span>
            <div className="pref-actions">
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => setPrefForm(DEFAULT_PREFERENCES)}
                disabled={savingPrefs}
              >
                {t('settings.resetDefaults')}
              </button>
              <button
                type="button"
                className="button button--primary button--sm"
                onClick={savePreferences}
                disabled={savingPrefs}
              >
                {savingPrefs ? <Spinner /> : <SlidersHorizontal size={14} />}
                {t('settings.savePreferences')}
              </button>
            </div>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card__head">
            <div>
              <h2>{t('settings.session.title')}</h2>
              <p>{t('settings.session.subtitle')}</p>
            </div>
            <span className="badge">{t('settings.temporary')}</span>
          </div>
          <div className="pref-switches">
            <label className="switch-row">
              <span className="switch-row__text">
                <strong>{t('settings.confirmDelete')}</strong>
                <small>{t('settings.confirmDeleteHint')}</small>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={!skipDeleteConfirm}
                onChange={(event) => {
                  if (!user) return
                  const skipped = !event.target.checked
                  setDeleteConfirmSkipped(user.id, skipped)
                  setSkipDeleteConfirm(skipped)
                }}
              />
            </label>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card__head">
            <div>
              <h2>{t('settings.appearance.title')}</h2>
              <p>{t('settings.appearance.subtitle')}</p>
            </div>
          </div>
          <div className="theme-options">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`theme-option ${theme === option.value ? 'is-active' : ''}`}
                  onClick={() => setTheme(option.value)}
                >
                  <Icon size={19} />
                  <span className="theme-option__label">{t(option.labelKey)}</span>
                  <span className="theme-option__desc">{t(option.descKey)}</span>
                  {theme === option.value ? (
                    <Check size={15} className="theme-option__check" />
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="settings-subhead">
            <h3>{t('settings.language.title')}</h3>
          </div>
          <div className="theme-options">
            {(['zh', 'en'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`theme-option ${locale === option ? 'is-active' : ''}`}
                onClick={() => setLocale(option)}
              >
                <span className="theme-option__label">{t(`settings.language.${option}`)}</span>
                <span className="theme-option__desc">
                  {t(option === 'zh' ? 'settings.language.zh' : 'settings.language.en')}
                </span>
                {locale === option ? <Check size={15} className="theme-option__check" /> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-card settings-about">
          <div className="settings-card__head">
            <div>
              <h2>{t('settings.about.title')}</h2>
              <p>{t('settings.aboutSubtitle')}</p>
            </div>
            <span className="badge">v{config?.version ?? '0.1.0'}</span>
          </div>
          <ul className="about-list">
            <li>
              <ShieldCheck size={15} />
              {t('settings.aboutSecurity')}
            </li>
            <li>
              <BadgeCheck size={15} />
              {t('settings.aboutSanitize')}
            </li>
            <li>
              <Monitor size={15} />
              {t('settings.aboutStack')}
            </li>
          </ul>
          <p className="settings-about__license">{t('settings.aboutLicense')}</p>
        </section>
      </main>

      <AccountDialog
        open={dialogOpen}
        account={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['accounts'] })
          queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
        }}
      />

      <Modal
        open={clearCacheOpen}
        title={t('settings.clearCacheTitle')}
        subtitle={t('settings.clearCacheSubtitle', {
          size: formatBytes(attachmentCache.data?.diskBytes ?? 0),
        })}
        onClose={() => {
          if (!clearCacheMutation.isPending) setClearCacheOpen(false)
        }}
        footer={
          <div className="dialog-actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setClearCacheOpen(false)}
              disabled={clearCacheMutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => clearCacheMutation.mutate()}
              disabled={clearCacheMutation.isPending}
            >
              {clearCacheMutation.isPending ? <Spinner /> : <Trash2 size={15} />}
              {t('settings.clearCache')}
            </button>
          </div>
        }
      >
        <p className="delete-note">{t('settings.clearCacheBody')}</p>
      </Modal>
    </div>
  )
}
