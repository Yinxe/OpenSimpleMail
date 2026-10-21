import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Spinner } from '@/components/Spinner'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'

export function RegisterPage() {
  const { register, config } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError(t('register.passwordShort'))
      return
    }
    if (password !== confirm) {
      setError(t('register.passwordMismatch'))
      return
    }
    setBusy(true)
    try {
      await register(name, email, password)
      navigate('/app', { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  if (config && !config.allowRegistration) {
    return (
      <AuthLayout version={config.version}>
        <div className="auth-card auth-card--closed">
          <span className="auth-card__closed-icon">
            <LockKeyhole size={24} />
          </span>
          <p className="eyebrow">REGISTRATION CLOSED</p>
          <h2>{t('register.closedTitle')}</h2>
          <p className="auth-card__sub">{t('register.closedBody', { site: config.siteName })}</p>
          <Link to="/login" className="button button--soft button--block auth-card__closed-action">
            {t('register.back')}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout version={config?.version}>
      <div className="auth-card">
        <p className="eyebrow">CREATE WORKSPACE</p>
        <h2>{t('register.title')}</h2>
        <p className="auth-card__sub">{t('register.subtitle')}</p>

        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">{t('register.name')}</span>
            <span className="field__control">
              <UserRound size={16} className="field__icon" />
              <input
                type="text"
                autoComplete="nickname"
                placeholder={t('register.namePlaceholder')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={60}
              />
            </span>
          </label>

          <label className="field">
            <span className="field__label">{t('register.email')}</span>
            <span className="field__control">
              <Mail size={16} className="field__icon" />
              <input
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </span>
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field__label">{t('register.password')}</span>
              <span className="field__control">
                <LockKeyhole size={16} className="field__icon" />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={t('register.passwordPlaceholder')}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                />
              </span>
            </label>
            <label className="field">
              <span className="field__label">{t('register.confirm')}</span>
              <span className="field__control">
                <LockKeyhole size={16} className="field__icon" />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={t('register.confirmPlaceholder')}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  required
                />
              </span>
            </label>
          </div>

          {error ? <p className="form__error">{error}</p> : null}

          <button type="submit" className="button button--primary button--block" disabled={busy}>
            {busy ? <Spinner /> : <ArrowRight size={17} />}
            {t('register.submit')}
          </button>
        </form>

        <p className="auth-card__switch">
          {t('register.haveAccount')}
          <Link to="/login">{t('register.loginLink')}</Link>
        </p>
      </div>
    </AuthLayout>
  )
}
