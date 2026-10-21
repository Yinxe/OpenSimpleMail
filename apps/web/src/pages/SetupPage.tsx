import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Globe2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Spinner } from '@/components/Spinner'
import { ThemeToggle } from '@/components/ThemeToggle'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/locales'

const STEPS: { id: number; labelKey: MessageKey; detailKey: MessageKey }[] = [
  { id: 1, labelKey: 'setup.step1Label', detailKey: 'setup.step1Detail' },
  { id: 2, labelKey: 'setup.step2Label', detailKey: 'setup.step2Detail' },
  { id: 3, labelKey: 'setup.step3Label', detailKey: 'setup.step3Detail' },
]

export function SetupPage() {
  const { config, loading, user, setup } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [siteName, setSiteName] = useState('OpenSimpleMail')
  const [allowRegistration, setAllowRegistration] = useState(false)
  const [demoEnabled, setDemoEnabled] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [defaultsApplied, setDefaultsApplied] = useState(false)

  useEffect(() => {
    if (!config || defaultsApplied) return
    setSiteName(config.siteName)
    setAllowRegistration(config.allowRegistration)
    setDemoEnabled(config.demoEnabled)
    setDefaultsApplied(true)
  }, [config, defaultsApplied])

  if (loading) {
    return (
      <div className="boot">
        <Logo />
        <span className="boot__hint">{t('setup.checking')}</span>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="setup setup--error">
        <div className="setup__error-card">
          <Logo compact />
          <h1>{t('setup.backendDownTitle')}</h1>
          <p>{t('setup.backendDownBody')}</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => window.location.reload()}
          >
            {t('setup.reload')}
          </button>
        </div>
      </div>
    )
  }

  if (config.initialized && step !== 4) {
    return <Navigate to={user ? '/app' : '/login'} replace />
  }

  function goNext(event?: FormEvent) {
    event?.preventDefault()
    setError('')
    if (step === 2) {
      if (!name.trim() || !email.trim()) {
        setError(t('setup.needAdmin'))
        return
      }
      if (password.length < 8) {
        setError(t('setup.adminPasswordShort'))
        return
      }
      if (password !== confirm) {
        setError(t('setup.passwordMismatch'))
        return
      }
    }
    if (step === 3 && !siteName.trim()) {
      setError(t('setup.needSiteName'))
      return
    }
    setStep((current) => Math.min(3, current + 1))
  }

  async function finish(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!siteName.trim()) {
      setError(t('setup.needSiteName'))
      return
    }
    setBusy(true)
    try {
      await setup({
        siteName: siteName.trim(),
        allowRegistration,
        demoEnabled,
        admin: { name: name.trim(), email: email.trim(), password },
      })
      setStep(4)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup">
      <aside className="setup__aside">
        <div className="setup__brand">
          <Logo />
        </div>

        <div className="setup__intro">
          <p className="eyebrow">FIRST RUN</p>
          <h1>
            {t('setup.welcomeTitle1')}
            <br />
            {t('setup.welcomeTitle2')}
          </h1>
          <p>{t('setup.welcomeLead')}</p>
        </div>

        <ol className="setup-steps">
          {STEPS.map((item) => {
            const state =
              step > item.id || step === 4 ? 'done' : step === item.id ? 'active' : 'todo'
            return (
              <li key={item.id} className={`setup-step is-${state}`}>
                <span className="setup-step__number">
                  {state === 'done' ? <Check size={14} /> : item.id}
                </span>
                <span className="setup-step__text">
                  <strong>{t(item.labelKey)}</strong>
                  <small>{t(item.detailKey)}</small>
                </span>
              </li>
            )
          })}
        </ol>

        <footer className="setup__aside-foot">
          <span>OpenSimpleMail</span>
          <span>MIT License</span>
        </footer>
      </aside>

      <main className="setup__main">
        <div className="setup__topbar">
          <span className="setup__progress">
            {step === 4 ? t('setup.progressDone') : t('setup.progressStep', { step })}
          </span>
          <ThemeToggle />
        </div>

        <div className="setup__card">
          {step === 1 ? (
            <div className="setup__panel">
              <span className="setup__icon">
                <Sparkles size={22} />
              </span>
              <p className="eyebrow">SETUP WIZARD</p>
              <h2>{t('setup.step1Title')}</h2>
              <p className="setup__lead">{t('setup.step1Lead')}</p>
              <ul className="setup__bullets">
                <li>
                  <ShieldCheck size={15} /> {t('setup.bullet1')}
                </li>
                <li>
                  <LockKeyhole size={15} /> {t('setup.bullet2')}
                </li>
                <li>
                  <Globe2 size={15} /> {t('setup.bullet3')}
                </li>
              </ul>
              <div className="setup__actions">
                <button type="button" className="button button--primary" onClick={() => setStep(2)}>
                  {t('setup.start')} <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <form className="setup__panel" onSubmit={goNext}>
              <span className="setup__icon">
                <UserRound size={22} />
              </span>
              <p className="eyebrow">STEP 2 · ADMIN</p>
              <h2>{t('setup.step2Title')}</h2>
              <p className="setup__lead">{t('setup.step2Lead')}</p>

              <div className="setup__form">
                <label className="field">
                  <span className="field__label">{t('setup.adminName')}</span>
                  <span className="field__control">
                    <UserRound size={16} className="field__icon" />
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={t('setup.adminNamePlaceholder')}
                      autoComplete="name"
                      required
                      maxLength={60}
                    />
                  </span>
                </label>
                <label className="field">
                  <span className="field__label">{t('setup.adminEmail')}</span>
                  <span className="field__control">
                    <Mail size={16} className="field__icon" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="admin@example.com"
                      autoComplete="username"
                      required
                    />
                  </span>
                </label>
                <div className="field-row">
                  <label className="field">
                    <span className="field__label">{t('setup.password')}</span>
                    <span className="field__control">
                      <LockKeyhole size={16} className="field__icon" />
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={t('setup.passwordPlaceholder')}
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                    </span>
                  </label>
                  <label className="field">
                    <span className="field__label">{t('setup.confirm')}</span>
                    <span className="field__control">
                      <LockKeyhole size={16} className="field__icon" />
                      <input
                        type="password"
                        value={confirm}
                        onChange={(event) => setConfirm(event.target.value)}
                        placeholder={t('setup.confirmPlaceholder')}
                        autoComplete="new-password"
                        required
                      />
                    </span>
                  </label>
                </div>
              </div>

              {error ? <p className="form__error">{error}</p> : null}

              <div className="setup__actions setup__actions--split">
                <button type="button" className="button button--ghost" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} /> {t('setup.back')}
                </button>
                <button type="submit" className="button button--primary">
                  {t('setup.next')} <ArrowRight size={16} />
                </button>
              </div>
            </form>
          ) : null}

          {step === 3 ? (
            <form className="setup__panel" onSubmit={finish}>
              <span className="setup__icon">
                <Globe2 size={22} />
              </span>
              <p className="eyebrow">STEP 3 · SYSTEM</p>
              <h2>{t('setup.step3Title')}</h2>
              <p className="setup__lead">{t('setup.step3Lead')}</p>

              <div className="setup__form">
                <label className="field">
                  <span className="field__label">{t('setup.siteName')}</span>
                  <span className="field__control">
                    <Globe2 size={16} className="field__icon" />
                    <input
                      value={siteName}
                      onChange={(event) => setSiteName(event.target.value)}
                      placeholder={t('setup.sitePlaceholder')}
                      maxLength={60}
                      required
                    />
                  </span>
                </label>

                <label className="switch-row">
                  <span className="switch-row__text">
                    <strong>{t('setup.allowRegistration')}</strong>
                    <small>{t('setup.allowRegistrationHint')}</small>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={allowRegistration}
                    onChange={(event) => setAllowRegistration(event.target.checked)}
                  />
                </label>

                <label className="switch-row">
                  <span className="switch-row__text">
                    <strong>{t('setup.demoEnabled')}</strong>
                    <small>{t('setup.demoEnabledHint')}</small>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={demoEnabled}
                    onChange={(event) => setDemoEnabled(event.target.checked)}
                  />
                </label>

                <div className="setup__summary">
                  <div>
                    <span>{t('setup.summaryAdmin')}</span>
                    <strong>{name || t('setup.notFilled')}</strong>
                    <small>{email || t('setup.notFilled')}</small>
                  </div>
                  <div>
                    <span>{t('setup.summaryRegistration')}</span>
                    <strong>{allowRegistration ? t('setup.allowed') : t('setup.off')}</strong>
                  </div>
                  <div>
                    <span>{t('setup.summaryDemo')}</span>
                    <strong>{demoEnabled ? t('setup.on') : t('setup.off')}</strong>
                  </div>
                </div>
              </div>

              {error ? <p className="form__error">{error}</p> : null}

              <div className="setup__actions setup__actions--split">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setStep(2)}
                  disabled={busy}
                >
                  <ArrowLeft size={16} /> {t('setup.back')}
                </button>
                <button type="submit" className="button button--primary" disabled={busy}>
                  {busy ? <Spinner /> : <ShieldCheck size={16} />}
                  {t('setup.finish')}
                </button>
              </div>
            </form>
          ) : null}

          {step === 4 ? (
            <div className="setup__panel setup__panel--done">
              <span className="setup__done-icon">
                <CheckCircle2 size={34} />
              </span>
              <p className="eyebrow">READY</p>
              <h2>{t('setup.doneTitle')}</h2>
              <p className="setup__lead">{t('setup.doneLead', { site: siteName })}</p>
              <div className="setup__done-grid">
                <div>
                  <span>{t('setup.doneSite')}</span>
                  <strong>{siteName}</strong>
                </div>
                <div>
                  <span>{t('setup.summaryAdmin')}</span>
                  <strong>{email}</strong>
                </div>
                <div>
                  <span>{t('setup.summaryRegistration')}</span>
                  <strong>{allowRegistration ? t('setup.enabled') : t('setup.disabled')}</strong>
                </div>
                <div>
                  <span>{t('setup.summaryDemo')}</span>
                  <strong>{demoEnabled ? t('setup.enabled') : t('setup.disabled')}</strong>
                </div>
              </div>
              <div className="setup__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => navigate('/app')}
                >
                  <Users size={16} /> {t('setup.enter')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
