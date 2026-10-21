import type { LoginEventDto, SessionDto, TotpEnabledDto, TotpSetupDto } from '@osm/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, KeyRound, Monitor, ShieldCheck, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { copyToClipboard } from '@/lib/clipboard'
import { useToast } from '@/lib/toast'
import { Spinner } from './Spinner'

/** Compress a user agent into "Chrome · Linux"; the raw string stays in the title. */
function describeAgent(userAgent: string | null): string {
  if (!userAgent) return '未知设备'
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : '浏览器'
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : ''
  return os ? `${browser} · ${os}` : browser
}

function formatMoment(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SecurityCard() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [formError, setFormError] = useState('')
  const [totpEnabled, setTotpEnabled] = useState(Boolean(user?.totpEnabled))
  const [setup, setSetup] = useState<TotpSetupDto | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [disablePassword, setDisablePassword] = useState('')
  const [totpError, setTotpError] = useState('')

  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<SessionDto[]>('/auth/sessions'),
  })
  const sessions = sessionsQuery.data ?? []

  const eventsQuery = useQuery({
    queryKey: ['login-events'],
    queryFn: () => api.get<LoginEventDto[]>('/auth/login-events?limit=8'),
  })
  const events = eventsQuery.data ?? []

  const changePassword = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/password', payload),
    onSuccess: () => {
      setForm({ currentPassword: '', newPassword: '', confirm: '' })
      setFormError('')
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast.success('密码已修改', '其他设备上的登录已自动退出')
    },
    onError: (error) => setFormError(errorMessage(error)),
  })

  const revokeSession = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast.success('已退出该会话')
    },
    onError: (error) => toast.error('退出会话失败', errorMessage(error)),
  })

  const startTotp = useMutation({
    mutationFn: () => api.post<TotpSetupDto>('/auth/totp/setup'),
    onSuccess: (result) => {
      setSetup(result)
      setRecoveryCodes(null)
      setTotpCode('')
      setTotpError('')
    },
    onError: (error) => setTotpError(errorMessage(error)),
  })

  const enableTotp = useMutation({
    mutationFn: (code: string) => api.post<TotpEnabledDto>('/auth/totp/enable', { code }),
    onSuccess: (result) => {
      setTotpEnabled(true)
      setSetup(null)
      setRecoveryCodes(result.recoveryCodes)
      setTotpCode('')
      toast.success('两步验证已开启', '请把恢复码保存在安全的地方')
    },
    onError: (error) => setTotpError(errorMessage(error)),
  })

  const disableTotp = useMutation({
    mutationFn: (password: string) => api.post('/auth/totp/disable', { password }),
    onSuccess: () => {
      setTotpEnabled(false)
      setRecoveryCodes(null)
      setDisablePassword('')
      setTotpError('')
      toast.success('两步验证已关闭')
    },
    onError: (error) => setTotpError(errorMessage(error)),
  })

  async function copyRecoveryCodes() {
    if (!recoveryCodes) return
    const copied = await copyToClipboard(recoveryCodes.join('\n'))
    if (copied) toast.success('恢复码已复制')
    else toast.error('复制失败', '请手动选择并复制')
  }

  const revokeOthers = useMutation({
    mutationFn: () => api.post<{ revoked: number }>('/auth/sessions/revoke-others', {}),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast.success(
        result.revoked > 0 ? `已退出 ${result.revoked} 个其他会话` : '没有其他登录中的会话',
      )
    },
    onError: (error) => toast.error('操作失败', errorMessage(error)),
  })

  function submitPassword(event: React.FormEvent) {
    event.preventDefault()
    setFormError('')
    if (!form.currentPassword) {
      setFormError('请输入当前密码')
      return
    }
    if (form.newPassword.length < 8) {
      setFormError('新密码至少需要 8 个字符')
      return
    }
    if (form.newPassword !== form.confirm) {
      setFormError('两次输入的新密码不一致')
      return
    }
    changePassword.mutate({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    })
  }

  const otherSessions = sessions.filter((session) => !session.current).length

  return (
    <section className="settings-card">
      <div className="settings-card__head">
        <div>
          <h2>账号安全</h2>
          <p>修改登录密码，并管理哪些设备还保持着登录状态。</p>
        </div>
        <span className="badge">
          <ShieldCheck size={13} /> 安全
        </span>
      </div>

      {user?.isDemo ? (
        <p className="settings-note">演示账号使用临时密码，不支持修改密码；可以正常管理会话。</p>
      ) : (
        <form className="security-form" onSubmit={submitPassword}>
          <div className="security-form__fields">
            <label className="field">
              <span>当前密码</span>
              <input
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                }
                placeholder="用于确认是你本人"
              />
            </label>
            <label className="field">
              <span>新密码</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.newPassword}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, newPassword: event.target.value }))
                }
                placeholder="至少 8 个字符"
              />
            </label>
            <label className="field">
              <span>确认新密码</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(event) => setForm((prev) => ({ ...prev, confirm: event.target.value }))}
                placeholder="再输入一次"
              />
            </label>
          </div>
          <div className="security-form__foot">
            {formError ? <span className="form__error">{formError}</span> : null}
            <button
              type="submit"
              className="button button--primary button--sm"
              disabled={changePassword.isPending}
            >
              {changePassword.isPending ? <Spinner /> : <KeyRound size={14} />}
              修改密码
            </button>
          </div>
        </form>
      )}

      <div className="security-sessions security-totp">
        <div className="security-sessions__head">
          <h3>
            <Smartphone size={14} /> 两步验证
          </h3>
          <span className="badge">{totpEnabled ? '已开启' : '未开启'}</span>
        </div>

        {totpError ? <p className="form__error">{totpError}</p> : null}

        {!totpEnabled && !setup ? (
          <div className="security-totp__intro">
            <p className="settings-note">
              开启后，登录除了密码还需要验证器应用（1Password、Google Authenticator 等）里的 6
              位验证码；忘记手机时可用一次性恢复码。
            </p>
            <button
              type="button"
              className="button button--soft button--sm"
              onClick={() => startTotp.mutate()}
              disabled={startTotp.isPending || user?.isDemo}
            >
              {startTotp.isPending ? <Spinner /> : <ShieldCheck size={14} />}
              开启两步验证
            </button>
          </div>
        ) : null}

        {setup ? (
          <div className="security-totp__setup">
            <p>
              1. 在验证器应用里添加账号，手动输入密钥（或粘贴下面的 <code>otpauth</code> 链接）：
            </p>
            <code className="totp-secret">{setup.secret}</code>
            <p className="totp-uri">{setup.otpauth}</p>
            <p>2. 输入应用里显示的 6 位验证码，确认绑定：</p>
            <form
              className="totp-form"
              onSubmit={(event) => {
                event.preventDefault()
                setTotpError('')
                enableTotp.mutate(totpCode.trim())
              }}
            >
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                aria-label="验证码"
              />
              <button
                type="submit"
                className="button button--primary button--sm"
                disabled={enableTotp.isPending || totpCode.trim().length < 6}
              >
                {enableTotp.isPending ? <Spinner /> : <Check size={14} />}
                确认开启
              </button>
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => {
                  setSetup(null)
                  setTotpError('')
                }}
              >
                取消
              </button>
            </form>
          </div>
        ) : null}

        {recoveryCodes ? (
          <div className="totp-recovery">
            <strong>恢复码（只显示这一次）</strong>
            <p>每行只能使用一次；忘记手机时用它登录，之后请重新生成。</p>
            <div className="totp-recovery__codes">
              {recoveryCodes.map((code) => (
                <code key={code}>{code}</code>
              ))}
            </div>
            <button
              type="button"
              className="button button--ghost button--sm"
              onClick={copyRecoveryCodes}
            >
              复制全部
            </button>
          </div>
        ) : null}

        {totpEnabled ? (
          <form
            className="totp-form"
            onSubmit={(event) => {
              event.preventDefault()
              setTotpError('')
              disableTotp.mutate(disablePassword)
            }}
          >
            <input
              type="password"
              autoComplete="current-password"
              placeholder="输入当前密码以关闭"
              value={disablePassword}
              onChange={(event) => setDisablePassword(event.target.value)}
              aria-label="当前密码"
            />
            <button
              type="submit"
              className="button button--ghost button--sm"
              disabled={disableTotp.isPending || !disablePassword}
            >
              {disableTotp.isPending ? <Spinner /> : null}
              关闭两步验证
            </button>
          </form>
        ) : null}
      </div>

      <div className="security-sessions">
        <div className="security-sessions__head">
          <h3>登录中的设备</h3>
          <button
            type="button"
            className="button button--ghost button--sm"
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending || otherSessions === 0}
          >
            {revokeOthers.isPending ? <Spinner /> : null}
            退出其他设备
          </button>
        </div>

        {sessionsQuery.isLoading ? (
          <div className="settings-loading">
            <Spinner size={18} /> 正在读取会话…
          </div>
        ) : null}

        {sessionsQuery.isError ? (
          <p className="settings-note">无法读取会话列表：{errorMessage(sessionsQuery.error)}</p>
        ) : null}

        {sessions.map((session) => (
          <article className="session-row" key={session.id}>
            <span className="session-row__icon">
              <Monitor size={16} />
            </span>
            <div className="session-row__body">
              <div className="session-row__title">
                <strong>{describeAgent(session.userAgent)}</strong>
                {session.current ? <span className="badge badge--warm">当前设备</span> : null}
              </div>
              <p title={session.userAgent ?? undefined}>
                {session.ip ?? '未知地址'} · 登录于 {formatMoment(session.createdAt)}
              </p>
            </div>
            {session.current ? null : (
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => revokeSession.mutate(session.id)}
                disabled={revokeSession.isPending}
              >
                退出
              </button>
            )}
          </article>
        ))}

        <div className="security-sessions__head security-sessions__head--events">
          <h3>最近登录</h3>
          <span className="security-sessions__hint">保留 90 天，最多显示 8 条</span>
        </div>

        {events.length === 0 ? (
          <p className="settings-note">还没有登录记录。</p>
        ) : (
          events.map((event) => (
            <article className="session-row" key={event.id}>
              <span
                className={`session-row__icon ${event.success ? '' : 'session-row__icon--warn'}`}
              >
                {event.success ? <KeyRound size={16} /> : <AlertTriangle size={16} />}
              </span>
              <div className="session-row__body">
                <div className="session-row__title">
                  <strong>{event.success ? '登录成功' : '登录失败'}</strong>
                  <span className="session-row__device">{describeAgent(event.userAgent)}</span>
                </div>
                <p>
                  {event.ip ?? '未知地址'} · {formatMoment(event.createdAt)}
                  {event.success
                    ? ''
                    : event.reason === 'demo'
                      ? ' · 演示账号禁止密码登录'
                      : ' · 密码不正确'}
                </p>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
