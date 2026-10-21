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
import { type ThemeChoice, useTheme } from '@/lib/theme'
import { useToast } from '@/lib/toast'

const THEME_OPTIONS: {
  value: ThemeChoice
  label: string
  description: string
  icon: typeof Sun
}[] = [
  { value: 'light', label: '浅色', description: '温暖纸张质感', icon: Sun },
  { value: 'dark', label: '深色', description: '夜间阅读更舒适', icon: Moon },
  { value: 'system', label: '跟随系统', description: '随系统外观自动切换', icon: Monitor },
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
      toast.success('系统设置已保存')
    },
    onError: (error) => toast.error('保存系统设置失败', errorMessage(error)),
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
      toast.success('附件缓存已清理')
    },
    onError: (error) => toast.error('清理附件缓存失败', errorMessage(error)),
  })

  useEffect(() => {
    document.title = `设置 · ${config?.siteName ?? 'OpenSimpleMail'}`
  }, [config?.siteName])

  const deleteMutation = useMutation({
    mutationFn: (accountId: string) => api.delete(`/accounts/${accountId}`),
    onSuccess: (_result, accountId) => {
      const account = accountsQuery.data?.find((item) => item.id === accountId)
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      toast.success('邮箱已移除', account?.email)
    },
    onError: (error) => toast.error('移除失败', errorMessage(error)),
  })

  async function testAccount(account: AccountDto) {
    setTestingId(account.id)
    try {
      const result = await api.post<TestResultDto>(`/accounts/${account.id}/test`)
      toast.success('连接正常', `IMAP 与 SMTP 均可用，耗时 ${result.durationMs} ms`)
    } catch (error) {
      toast.error('连接失败', errorMessage(error))
    } finally {
      setTestingId(null)
    }
  }

  function removeAccount(account: AccountDto) {
    const confirmed = window.confirm(
      `确定移除「${account.name} <${account.email}>」吗？\n\n这只会删除本应用中的账户配置，不会影响邮箱服务器上的任何邮件。`,
    )
    if (confirmed) deleteMutation.mutate(account.id)
  }

  async function savePreferences() {
    setSavingPrefs(true)
    try {
      await updatePreferences(prefForm)
      toast.success('使用偏好已保存')
    } catch (error) {
      toast.error('保存使用偏好失败', errorMessage(error))
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
      toast.error('当前浏览器不支持桌面通知')
      return
    }
    try {
      const permission =
        Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('未获得通知权限', '请在浏览器的站点设置中允许通知后重试')
        return
      }
      setPrefForm((current) => ({ ...current, desktopNotifications: true }))
    } catch {
      toast.error('无法请求通知权限')
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
            <ArrowLeft size={16} /> 返回邮箱
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
              <span className="badge badge--warm">演示工作区</span>
            ) : user.isAdmin ? (
              <span className="badge badge--warm">
                <ShieldCheck size={13} /> 管理员
              </span>
            ) : (
              <span className="badge">
                <BadgeCheck size={13} /> 本地账号
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
            <LogOut size={15} /> 退出登录
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
              <Plus size={15} /> 添加邮箱
            </button>
          </div>

          <div className="account-cards">
            {accountsQuery.isLoading ? (
              <div className="settings-loading">
                <Spinner size={20} /> 正在读取账户…
              </div>
            ) : null}

            {accounts.map((account) => (
              <article className="account-card" key={account.id}>
                <Avatar name={account.name} seed={account.email} color={account.color} size="md" />
                <div className="account-card__body">
                  <div className="account-card__title">
                    <h3>{account.name}</h3>
                    {account.kind === 'demo' ? (
                      <span className="badge badge--warm">演示</span>
                    ) : null}
                  </div>
                  <p className="account-card__email">{account.email}</p>
                  <p className="account-card__servers">
                    {account.kind === 'demo'
                      ? '内置示例数据，不会连接外部服务器'
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
                    测试
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
                        title="编辑"
                        aria-label="编辑"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        onClick={() => removeAccount(account)}
                        title="移除"
                        aria-label="移除"
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
                <p>还没有添加邮箱账户。</p>
                <button
                  type="button"
                  className="button button--soft button--sm"
                  onClick={() => {
                    setEditing(null)
                    setDialogOpen(true)
                  }}
                >
                  <Plus size={15} /> 添加第一个邮箱
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {user.isAdmin ? (
          <section className="settings-card">
            <div className="settings-card__head">
              <div>
                <h2>系统设置</h2>
                <p>控制公开注册、演示入口与站点名称，仅管理员可见。</p>
              </div>
              <span className="badge">
                <Settings2 size={13} /> 管理员
              </span>
            </div>

            <div className="admin-settings">
              <label className="field">
                <span className="field__label">站点名称</span>
                <input
                  className="input"
                  value={adminForm.siteName}
                  maxLength={60}
                  onChange={(event) =>
                    setAdminForm((current) => ({ ...current, siteName: event.target.value }))
                  }
                  placeholder="例如：Yinx 的邮箱"
                />
              </label>

              <label className="switch-row">
                <span className="switch-row__text">
                  <strong>允许公开注册</strong>
                  <small>
                    开启后任何人都可以创建本地账号；关闭后只有管理员能创建账号。
                    {adminForm.allowRegistration ? ' 当前：允许注册。' : ' 当前：仅管理员可创建。'}
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
                  <strong>启用演示邮箱</strong>
                  <small>在登录页保留「用演示邮箱直接体验」入口，适合展示或试用。</small>
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
                <span>保存后立即生效；已登录用户不会受到影响。</span>
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
                  保存设置
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {user.isAdmin ? (
          <section className="settings-card">
            <div className="settings-card__head">
              <div>
                <h2>附件缓存</h2>
                <p>
                  收信时解析出的附件会暂存在服务器磁盘上，同一封邮件的多个附件因此不必重复下载。
                </p>
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
                      ? '正在读取…'
                      : `${attachmentCache.data?.entries ?? 0} 封邮件的附件在缓存中`}
                  </strong>
                  <small>
                    磁盘 {formatBytes(attachmentCache.data?.diskBytes ?? 0)} / 上限{' '}
                    {formatBytes(attachmentCache.data?.limitBytes ?? 0)}，正文常驻内存{' '}
                    {formatBytes(attachmentCache.data?.memoryBytes ?? 0)}。闲置 10
                    分钟或超出上限后会自动淘汰。
                  </small>
                </span>
              </div>

              <div className="admin-settings__foot">
                <span>清理只删除缓存，不会影响服务器上的邮件和附件本身。</span>
                <button
                  type="button"
                  className="button button--ghost button--sm"
                  onClick={() => setClearCacheOpen(true)}
                  disabled={clearCacheMutation.isPending}
                >
                  {clearCacheMutation.isPending ? <Spinner /> : <Trash2 size={14} />}
                  清理缓存
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
              <p>这些设置保存在服务端，换设备登录也会保持一致。</p>
            </div>
            <span className="badge">
              <SlidersHorizontal size={13} /> 个性化
            </span>
          </div>

          <div className="pref-grid">
            <label className="field">
              <span className="field__label">自动刷新间隔</span>
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
                <option value={0}>关闭自动刷新</option>
                <option value={15}>每 15 秒</option>
                <option value={30}>每 30 秒</option>
                <option value={60}>每 1 分钟</option>
                <option value={300}>每 5 分钟</option>
                <option value={600}>每 10 分钟</option>
              </select>
            </label>

            <label className="field">
              <span className="field__label">每页邮件数</span>
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
                <option value={20}>20 封</option>
                <option value={30}>30 封</option>
                <option value={50}>50 封</option>
                <option value={100}>100 封</option>
              </select>
            </label>

            <label className="field">
              <span className="field__label">默认视图</span>
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
                <option value="account">打开第一个邮箱</option>
                <option value="unified">全部收件箱</option>
              </select>
            </label>

            <label className="field">
              <span className="field__label">列表密度</span>
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
                <option value="comfortable">舒适（显示预览）</option>
                <option value="compact">紧凑（更多邮件）</option>
              </select>
            </label>
          </div>

          <div className="pref-switches">
            <label className="switch-row">
              <span className="switch-row__text">
                <strong>打开邮件时自动标为已读</strong>
                <small>关闭后可以手动控制已读状态，适合需要稍后处理的邮件。</small>
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
                <strong>默认显示远程图片</strong>
                <small>远程图片可能被发件人用于追踪阅读行为，开启后不再逐封询问。</small>
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
                <strong>桌面通知</strong>
                <small>页面在后台时，新邮件会弹出系统通知；首次开启需要浏览器授权。</small>
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
            <span>自动刷新关闭后，仍可通过窗口聚焦或右上角刷新按钮获取新邮件。</span>
            <div className="pref-actions">
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => setPrefForm(DEFAULT_PREFERENCES)}
                disabled={savingPrefs}
              >
                恢复默认
              </button>
              <button
                type="button"
                className="button button--primary button--sm"
                onClick={savePreferences}
                disabled={savingPrefs}
              >
                {savingPrefs ? <Spinner /> : <SlidersHorizontal size={14} />}
                保存偏好
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
            <span className="badge">临时</span>
          </div>
          <div className="pref-switches">
            <label className="switch-row">
              <span className="switch-row__text">
                <strong>删除邮件前二次确认</strong>
                <small>
                  关闭后，删除会立即执行，不再弹出确认框；也可以在删除确认框里取消勾选。
                </small>
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
                  <span className="theme-option__label">{option.label}</span>
                  <span className="theme-option__desc">{option.description}</span>
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
                  {option === 'zh' ? '简体中文' : 'English'}
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
              <p>一个自托管的开源多邮箱 Web 客户端。</p>
            </div>
            <span className="badge">v{config?.version ?? '0.1.0'}</span>
          </div>
          <ul className="about-list">
            <li>
              <ShieldCheck size={15} />
              邮箱密码使用 AES-256-GCM 加密，密钥由 <code>APP_SECRET</code> 派生；会话 Cookie 为
              HttpOnly + SameSite=Lax。
            </li>
            <li>
              <BadgeCheck size={15} />
              邮件正文在服务端清洗，并在沙箱 iframe 中以严格 CSP 渲染，默认拦截远程图片。
            </li>
            <li>
              <Monitor size={15} />
              React + Vite 前端，NestJS + SQLite 后端，IMAP / SMTP 使用 ImapFlow 与 Nodemailer。
            </li>
          </ul>
          <p className="settings-about__license">MIT License · 欢迎自托管与二次开发</p>
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
        title="清理附件缓存？"
        subtitle={`将释放约 ${formatBytes(attachmentCache.data?.diskBytes ?? 0)} 磁盘空间`}
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
              取消
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => clearCacheMutation.mutate()}
              disabled={clearCacheMutation.isPending}
            >
              {clearCacheMutation.isPending ? <Spinner /> : <Trash2 size={15} />}
              清理缓存
            </button>
          </div>
        }
      >
        <p className="delete-note">
          缓存中的附件会在下次打开邮件或下载时重新从邮件服务器读取；邮件、附件本身和已发送的邮件都不受影响。
        </p>
      </Modal>
    </div>
  )
}
