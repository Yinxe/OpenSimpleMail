import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole, Mail, Sparkles } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Spinner } from '@/components/Spinner'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'

type Mode = 'login' | 'recover'

export function LoginPage() {
  const { login, loginTotp, demoLogin, recoverAdmin, config } = useAuth()
  const { t } = useI18n()
  const siteName = config?.siteName ?? 'OpenSimpleMail'
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  // Set when the password was accepted but the account needs an authenticator code.
  const [challenge, setChallenge] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const token = await login(email, password)
      if (token) {
        setChallenge(token)
        setTotpCode('')
        return
      }
      navigate('/app', { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function onVerify(event: FormEvent) {
    event.preventDefault()
    if (!challenge) return
    setError('')
    setBusy(true)
    try {
      await loginTotp(challenge, totpCode)
      navigate('/app', { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function onRecover(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (newPassword.length < 8) {
      setError(t('login.passwordShort'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('login.passwordMismatch'))
      return
    }
    setBusy(true)
    try {
      await recoverAdmin(recoveryEmail, recoveryPassword, newPassword)
      navigate('/app', { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function onDemo() {
    setError('')
    setDemoBusy(true)
    try {
      await demoLogin()
      navigate('/app', { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setDemoBusy(false)
    }
  }

  function openRecovery() {
    setMode('recover')
    setError('')
    setRecoveryEmail(email)
    setRecoveryPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  function closeRecovery() {
    setMode('login')
    setError('')
  }

  return (
    <AuthLayout version={config?.version}>
      {mode === 'login' && challenge ? (
        <div className="auth-card">
          <p className="eyebrow">{t('login.totp.eyebrow')}</p>
          <h2>{t('login.totp.title')}</h2>
          <p className="auth-card__sub">{t('login.totp.subtitle', { site: siteName })}</p>

          <form className="form" onSubmit={onVerify}>
            <label className="field">
              <span className="field__label">{t('login.totp.code')}</span>
              <span className="field__control">
                <KeyRound size={16} className="field__icon" />
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={t('login.totp.placeholder')}
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  required
                />
              </span>
            </label>

            {error ? <p className="form__error">{error}</p> : null}

            <button type="submit" className="button button--primary button--block" disabled={busy}>
              {busy ? <Spinner /> : <ArrowRight size={17} />}
              {t('login.totp.submit')}
            </button>
          </form>

          <button
            type="button"
            className="auth-card__recover-link"
            onClick={() => {
              setChallenge(null)
              setError('')
            }}
          >
            <ArrowLeft size={13} /> {t('login.totp.back')}
          </button>
        </div>
      ) : mode === 'login' ? (
        <div className="auth-card">
          <p className="eyebrow">{t('login.eyebrow')}</p>
          <h2>{t('login.title')}</h2>
          <p className="auth-card__sub">{t('login.subtitle', { site: siteName })}</p>

          <form className="form" onSubmit={onSubmit}>
            <label className="field">
              <span className="field__label">{t('login.email')}</span>
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

            <label className="field">
              <span className="field__label">{t('login.password')}</span>
              <span className="field__control">
                <LockKeyhole size={16} className="field__icon" />
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder={t('login.passwordPlaceholder')}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </span>
            </label>

            {error ? <p className="form__error">{error}</p> : null}

            <button type="submit" className="button button--primary button--block" disabled={busy}>
              {busy ? <Spinner /> : <ArrowRight size={17} />}
              {t('login.submit')}
            </button>
          </form>

          {config?.recoveryEnabled ? (
            <button type="button" className="auth-card__recover-link" onClick={openRecovery}>
              <KeyRound size={13} /> {t('login.forgot')}
            </button>
          ) : null}

          {config?.demoEnabled ? (
            <>
              <div className="divider">
                <span>{t('login.divider')}</span>
              </div>
              <button
                type="button"
                className="button button--soft button--block"
                onClick={onDemo}
                disabled={demoBusy}
              >
                {demoBusy ? <Spinner /> : <Sparkles size={16} />}
                {t('login.demoButton')}
              </button>
              <p className="auth-card__hint">{t('login.demoHint')}</p>
            </>
          ) : null}

          {config?.allowRegistration ? (
            <p className="auth-card__switch">
              {t('login.registerPrompt')}
              <Link to="/register">{t('login.registerLink')}</Link>
            </p>
          ) : (
            <p className="auth-card__hint auth-card__hint--closed">{t('login.registerClosed')}</p>
          )}
        </div>
      ) : (
        <div className="auth-card">
          <p className="eyebrow">{t('login.recover.eyebrow')}</p>
          <h2>{t('login.recover.title')}</h2>
          <p className="auth-card__sub">{t('login.recover.subtitle')}</p>

          <form className="form" onSubmit={onRecover}>
            <label className="field">
              <span className="field__label">{t('login.recover.email')}</span>
              <span className="field__control">
                <Mail size={16} className="field__icon" />
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="admin@example.com"
                  value={recoveryEmail}
                  onChange={(event) => setRecoveryEmail(event.target.value)}
                  required
                />
              </span>
            </label>

            <label className="field">
              <span className="field__label">{t('login.recover.recoveryPassword')}</span>
              <span className="field__control">
                <KeyRound size={16} className="field__icon" />
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={t('login.recover.passwordPlaceholder')}
                  value={recoveryPassword}
                  onChange={(event) => setRecoveryPassword(event.target.value)}
                  required
                  minLength={12}
                />
              </span>
            </label>

            <div className="field-row">
              <label className="field">
                <span className="field__label">{t('login.recover.newPassword')}</span>
                <span className="field__control">
                  <LockKeyhole size={16} className="field__icon" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder={t('login.recover.newPasswordPlaceholder')}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    minLength={8}
                  />
                </span>
              </label>
              <label className="field">
                <span className="field__label">{t('login.recover.confirmPassword')}</span>
                <span className="field__control">
                  <LockKeyhole size={16} className="field__icon" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder={t('login.recover.confirmPlaceholder')}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </span>
              </label>
            </div>

            {error ? <p className="form__error">{error}</p> : null}

            <button type="submit" className="button button--primary button--block" disabled={busy}>
              {busy ? <Spinner /> : <KeyRound size={17} />}
              {t('login.recover.submit')}
            </button>
          </form>

          <p className="auth-card__recover-note">{t('login.recover.hint')}</p>

          <button type="button" className="auth-card__recover-back" onClick={closeRecovery}>
            <ArrowLeft size={13} /> {t('login.recover.back')}
          </button>
        </div>
      )}
    </AuthLayout>
  )
}
