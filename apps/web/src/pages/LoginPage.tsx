import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole, Mail, Sparkles } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Spinner } from '@/components/Spinner'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'

type Mode = 'login' | 'recover'

export function LoginPage() {
  const { login, demoLogin, recoverAdmin, config } = useAuth()
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
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
      setError('新密码至少需要 8 个字符')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
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
      {mode === 'login' ? (
        <div className="auth-card">
          <p className="eyebrow">WELCOME BACK</p>
          <h2>登录你的邮箱工作台</h2>
          <p className="auth-card__sub">
            欢迎回到 {config?.siteName ?? 'OpenSimpleMail'}，继续处理那些值得认真回复的邮件。
          </p>

          <form className="form" onSubmit={onSubmit}>
            <label className="field">
              <span className="field__label">邮箱地址</span>
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
              <span className="field__label">密码</span>
              <span className="field__control">
                <LockKeyhole size={16} className="field__icon" />
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="至少 8 个字符"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </span>
            </label>

            {error ? <p className="form__error">{error}</p> : null}

            <button type="submit" className="button button--primary button--block" disabled={busy}>
              {busy ? <Spinner /> : <ArrowRight size={17} />}
              登录
            </button>
          </form>

          {config?.recoveryEnabled ? (
            <button type="button" className="auth-card__recover-link" onClick={openRecovery}>
              <KeyRound size={13} /> 忘记管理员密码？
            </button>
          ) : null}

          {config?.demoEnabled ? (
            <>
              <div className="divider">
                <span>或</span>
              </div>
              <button
                type="button"
                className="button button--soft button--block"
                onClick={onDemo}
                disabled={demoBusy}
              >
                {demoBusy ? <Spinner /> : <Sparkles size={16} />}
                用演示邮箱直接体验
              </button>
              <p className="auth-card__hint">
                演示模式会创建一个临时账号，内置示例邮件，可随意收发。
              </p>
            </>
          ) : null}

          {config?.allowRegistration ? (
            <p className="auth-card__switch">
              还没有账号？<Link to="/register">创建一个</Link>
            </p>
          ) : (
            <p className="auth-card__hint auth-card__hint--closed">
              公开注册已关闭。如需账号，请联系系统管理员。
            </p>
          )}
        </div>
      ) : (
        <div className="auth-card">
          <p className="eyebrow">ADMIN RECOVERY</p>
          <h2>恢复管理员访问</h2>
          <p className="auth-card__sub">
            使用服务器环境变量 <code>ADMIN_RECOVERY_PASSWORD</code>{' '}
            中的临时密码，重置管理员密码并登录。
          </p>

          <form className="form" onSubmit={onRecover}>
            <label className="field">
              <span className="field__label">管理员邮箱</span>
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
              <span className="field__label">恢复密码（环境变量）</span>
              <span className="field__control">
                <KeyRound size={16} className="field__icon" />
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="ADMIN_RECOVERY_PASSWORD 的值"
                  value={recoveryPassword}
                  onChange={(event) => setRecoveryPassword(event.target.value)}
                  required
                  minLength={12}
                />
              </span>
            </label>

            <div className="field-row">
              <label className="field">
                <span className="field__label">新密码</span>
                <span className="field__control">
                  <LockKeyhole size={16} className="field__icon" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="至少 8 位"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    minLength={8}
                  />
                </span>
              </label>
              <label className="field">
                <span className="field__label">确认新密码</span>
                <span className="field__control">
                  <LockKeyhole size={16} className="field__icon" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="再输入一次"
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
              重置密码并登录
            </button>
          </form>

          <p className="auth-card__recover-note">
            恢复成功后会注销该管理员的其他登录会话。完成后请从服务器移除
            <code>ADMIN_RECOVERY_PASSWORD</code> 并重启服务。
          </p>

          <button type="button" className="auth-card__recover-back" onClick={closeRecovery}>
            <ArrowLeft size={13} /> 返回普通登录
          </button>
        </div>
      )}
    </AuthLayout>
  )
}
