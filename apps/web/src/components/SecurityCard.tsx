import type { LoginEventDto, SessionDto, TotpEnabledDto, TotpSetupDto } from '@osm/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, KeyRound, Monitor, ShieldCheck, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { copyToClipboard } from '@/lib/clipboard'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/locales'
import { useToast } from '@/lib/toast'
import { Spinner } from './Spinner'

/** Compress a user agent into "Chrome · Linux"; the raw string stays in the title. */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

function describeAgent(userAgent: string | null, t: Translate): string {
  if (!userAgent) return t('security.unknownDevice')
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : t('security.browser')
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
  const { t } = useI18n()
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
      toast.success(t('security.passwordChanged'), t('security.passwordChangedBody'))
    },
    onError: (error) => setFormError(errorMessage(error)),
  })

  const revokeSession = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast.success(t('security.sessionRevoked'))
    },
    onError: (error) => toast.error(t('security.revokeFailed'), errorMessage(error)),
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
      toast.success(t('security.totpEnabled'), t('security.totpEnabledBody'))
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
      toast.success(t('security.totpDisabled'))
    },
    onError: (error) => setTotpError(errorMessage(error)),
  })

  async function copyRecoveryCodes() {
    if (!recoveryCodes) return
    const copied = await copyToClipboard(recoveryCodes.join('\n'))
    if (copied) toast.success(t('security.recoveryCopied'))
    else toast.error(t('security.copyFailed'), t('security.copyFailedBody'))
  }

  const revokeOthers = useMutation({
    mutationFn: () => api.post<{ revoked: number }>('/auth/sessions/revoke-others', {}),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast.success(
        result.revoked > 0
          ? t('security.revokedOthers', { count: result.revoked })
          : t('security.noOtherSessions'),
      )
    },
    onError: (error) => toast.error(t('security.actionFailed'), errorMessage(error)),
  })

  function submitPassword(event: React.FormEvent) {
    event.preventDefault()
    setFormError('')
    if (!form.currentPassword) {
      setFormError(t('security.enterCurrentPassword'))
      return
    }
    if (form.newPassword.length < 8) {
      setFormError(t('security.passwordShort'))
      return
    }
    if (form.newPassword !== form.confirm) {
      setFormError(t('security.passwordMismatch'))
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
          <h2>{t('security.title')}</h2>
          <p>{t('security.subtitle')}</p>
        </div>
        <span className="badge">
          <ShieldCheck size={13} /> {t('security.badge')}
        </span>
      </div>

      {user?.isDemo ? (
        <p className="settings-note">{t('security.demoNote')}</p>
      ) : (
        <form className="security-form" onSubmit={submitPassword}>
          <div className="security-form__fields">
            <label className="field">
              <span>{t('security.currentPassword')}</span>
              <input
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                }
                placeholder={t('security.currentPasswordPlaceholder')}
              />
            </label>
            <label className="field">
              <span>{t('security.newPassword')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.newPassword}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, newPassword: event.target.value }))
                }
                placeholder={t('security.newPasswordPlaceholder')}
              />
            </label>
            <label className="field">
              <span>{t('security.confirmPassword')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(event) => setForm((prev) => ({ ...prev, confirm: event.target.value }))}
                placeholder={t('security.confirmPlaceholder')}
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
              {t('security.changePassword')}
            </button>
          </div>
        </form>
      )}

      <div className="security-sessions security-totp">
        <div className="security-sessions__head">
          <h3>
            <Smartphone size={14} /> {t('security.totpTitle')}
          </h3>
          <span className="badge">
            {totpEnabled ? t('security.totpOn') : t('security.totpOff')}
          </span>
        </div>

        {totpError ? <p className="form__error">{totpError}</p> : null}

        {!totpEnabled && !setup ? (
          <div className="security-totp__intro">
            <p className="settings-note">{t('security.totpIntro')}</p>
            <button
              type="button"
              className="button button--soft button--sm"
              onClick={() => startTotp.mutate()}
              disabled={startTotp.isPending || user?.isDemo}
            >
              {startTotp.isPending ? <Spinner /> : <ShieldCheck size={14} />}
              {t('security.enableTotp')}
            </button>
          </div>
        ) : null}

        {setup ? (
          <div className="security-totp__setup">
            <p>{t('security.setupStep1')}</p>
            <code className="totp-secret">{setup.secret}</code>
            <p className="totp-uri">{setup.otpauth}</p>
            <p>{t('security.setupStep2')}</p>
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
                aria-label={t('security.codeAria')}
              />
              <button
                type="submit"
                className="button button--primary button--sm"
                disabled={enableTotp.isPending || totpCode.trim().length < 6}
              >
                {enableTotp.isPending ? <Spinner /> : <Check size={14} />}
                {t('security.confirmEnable')}
              </button>
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => {
                  setSetup(null)
                  setTotpError('')
                }}
              >
                {t('common.cancel')}
              </button>
            </form>
          </div>
        ) : null}

        {recoveryCodes ? (
          <div className="totp-recovery">
            <strong>{t('security.recoveryTitle')}</strong>
            <p>{t('security.recoveryHint')}</p>
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
              {t('security.copyAll')}
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
              placeholder={t('security.disablePlaceholder')}
              value={disablePassword}
              onChange={(event) => setDisablePassword(event.target.value)}
              aria-label={t('security.currentPassword')}
            />
            <button
              type="submit"
              className="button button--ghost button--sm"
              disabled={disableTotp.isPending || !disablePassword}
            >
              {disableTotp.isPending ? <Spinner /> : null}
              {t('security.disable')}
            </button>
          </form>
        ) : null}
      </div>

      <div className="security-sessions">
        <div className="security-sessions__head">
          <h3>{t('security.devices')}</h3>
          <button
            type="button"
            className="button button--ghost button--sm"
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending || otherSessions === 0}
          >
            {revokeOthers.isPending ? <Spinner /> : null}
            {t('security.revokeOthers')}
          </button>
        </div>

        {sessionsQuery.isLoading ? (
          <div className="settings-loading">
            <Spinner size={18} /> {t('security.loadingSessions')}
          </div>
        ) : null}

        {sessionsQuery.isError ? (
          <p className="settings-note">
            {t('security.sessionsError', { error: errorMessage(sessionsQuery.error) })}
          </p>
        ) : null}

        {sessions.map((session) => (
          <article className="session-row" key={session.id}>
            <span className="session-row__icon">
              <Monitor size={16} />
            </span>
            <div className="session-row__body">
              <div className="session-row__title">
                <strong>{describeAgent(session.userAgent, t)}</strong>
                {session.current ? (
                  <span className="badge badge--warm">{t('security.currentDevice')}</span>
                ) : null}
              </div>
              <p title={session.userAgent ?? undefined}>
                {session.ip ?? t('security.unknownAddress')} ·{' '}
                {t('security.signedInAt', { time: formatMoment(session.createdAt) })}
              </p>
            </div>
            {session.current ? null : (
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => revokeSession.mutate(session.id)}
                disabled={revokeSession.isPending}
              >
                {t('security.revoke')}
              </button>
            )}
          </article>
        ))}

        <div className="security-sessions__head security-sessions__head--events">
          <h3>{t('security.recent')}</h3>
          <span className="security-sessions__hint">{t('security.recentHint')}</span>
        </div>

        {events.length === 0 ? (
          <p className="settings-note">{t('security.noEvents')}</p>
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
                  <strong>
                    {event.success ? t('security.loginOk') : t('security.loginFailed')}
                  </strong>
                  <span className="session-row__device">{describeAgent(event.userAgent, t)}</span>
                </div>
                <p>
                  {event.ip ?? t('security.unknownAddress')} · {formatMoment(event.createdAt)}
                  {event.success
                    ? ''
                    : event.reason === 'demo'
                      ? t('security.demoBlocked')
                      : t('security.badPassword')}
                </p>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
