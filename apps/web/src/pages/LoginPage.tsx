import { ArrowRight, LockKeyhole, Mail, Sparkles } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Spinner } from '@/components/Spinner'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export function LoginPage() {
  const { login, demoLogin, config } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

  return (
    <AuthLayout version={config?.version}>
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
    </AuthLayout>
  )
}
