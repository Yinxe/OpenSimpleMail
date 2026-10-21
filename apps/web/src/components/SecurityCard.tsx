import type { LoginEventDto, SessionDto } from '@osm/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, KeyRound, Monitor, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
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
