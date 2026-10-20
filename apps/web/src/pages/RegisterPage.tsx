import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Spinner } from '@/components/Spinner'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export function RegisterPage() {
  const { register, config } = useAuth()
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
      setError('密码至少需要 8 个字符')
      return
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致')
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

  return (
    <AuthLayout version={config?.version}>
      <div className="auth-card">
        <p className="eyebrow">CREATE WORKSPACE</p>
        <h2>创建你的工作台</h2>
        <p className="auth-card__sub">先创建本地账号，随后再添加你的邮箱账户。</p>

        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">昵称</span>
            <span className="field__control">
              <UserRound size={16} className="field__icon" />
              <input
                type="text"
                autoComplete="nickname"
                placeholder="你的名字"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={60}
              />
            </span>
          </label>

          <label className="field">
            <span className="field__label">登录邮箱</span>
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
              <span className="field__label">密码</span>
              <span className="field__control">
                <LockKeyhole size={16} className="field__icon" />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="至少 8 位"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                />
              </span>
            </label>
            <label className="field">
              <span className="field__label">确认密码</span>
              <span className="field__control">
                <LockKeyhole size={16} className="field__icon" />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="再输入一次"
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
            创建账号
          </button>
        </form>

        <p className="auth-card__switch">
          已经有账号？<Link to="/login">直接登录</Link>
        </p>
      </div>
    </AuthLayout>
  )
}
