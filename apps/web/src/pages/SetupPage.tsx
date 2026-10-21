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

const STEPS = [
  { id: 1, label: '欢迎', detail: '了解首次启动' },
  { id: 2, label: '管理员', detail: '创建最高权限账号' },
  { id: 3, label: '系统配置', detail: '注册与演示设置' },
]

export function SetupPage() {
  const { config, loading, user, setup } = useAuth()
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
        <span className="boot__hint">正在检查系统状态…</span>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="setup setup--error">
        <div className="setup__error-card">
          <Logo compact />
          <h1>无法连接后端服务</h1>
          <p>请确认 OpenSimpleMail 服务已经启动，然后重试。</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => window.location.reload()}
          >
            重新加载
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
        setError('请填写管理员昵称和邮箱')
        return
      }
      if (password.length < 8) {
        setError('管理员密码至少需要 8 个字符')
        return
      }
      if (password !== confirm) {
        setError('两次输入的密码不一致')
        return
      }
    }
    if (step === 3 && !siteName.trim()) {
      setError('请填写站点名称')
      return
    }
    setStep((current) => Math.min(3, current + 1))
  }

  async function finish(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!siteName.trim()) {
      setError('请填写站点名称')
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
            欢迎来到
            <br />
            你自己的邮件工作台。
          </h1>
          <p>只需要三步，就能把系统交给管理员并开始接入邮箱。</p>
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
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
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
          <span className="setup__progress">{step === 4 ? '初始化完成' : `步骤 ${step} / 3`}</span>
          <ThemeToggle />
        </div>

        <div className="setup__card">
          {step === 1 ? (
            <div className="setup__panel">
              <span className="setup__icon">
                <Sparkles size={22} />
              </span>
              <p className="eyebrow">SETUP WIZARD</p>
              <h2>先把钥匙交给你。</h2>
              <p className="setup__lead">
                这是系统的首次启动。接下来会创建唯一的初始管理员，并确定公开注册、演示模式等基础配置。
                这些选项之后都可以在「设置 → 系统设置」中修改。
              </p>
              <ul className="setup__bullets">
                <li>
                  <ShieldCheck size={15} /> 管理员拥有系统配置权限，普通用户只能管理自己的邮箱
                </li>
                <li>
                  <LockKeyhole size={15} /> 公开注册默认关闭，适合个人或小团队自托管
                </li>
                <li>
                  <Globe2 size={15} /> 支持多个 IMAP / SMTP 邮箱，数据保存在本机 SQLite
                </li>
              </ul>
              <div className="setup__actions">
                <button type="button" className="button button--primary" onClick={() => setStep(2)}>
                  开始初始化 <ArrowRight size={16} />
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
              <h2>创建管理员账号</h2>
              <p className="setup__lead">
                这是系统的最高权限账号。请使用一个你能长期保管的邮箱和强密码。
              </p>

              <div className="setup__form">
                <label className="field">
                  <span className="field__label">管理员昵称</span>
                  <span className="field__control">
                    <UserRound size={16} className="field__icon" />
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="例如：Yinx"
                      autoComplete="name"
                      required
                      maxLength={60}
                    />
                  </span>
                </label>
                <label className="field">
                  <span className="field__label">管理员邮箱</span>
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
                    <span className="field__label">密码</span>
                    <span className="field__control">
                      <LockKeyhole size={16} className="field__icon" />
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="至少 8 位"
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                    </span>
                  </label>
                  <label className="field">
                    <span className="field__label">确认密码</span>
                    <span className="field__control">
                      <LockKeyhole size={16} className="field__icon" />
                      <input
                        type="password"
                        value={confirm}
                        onChange={(event) => setConfirm(event.target.value)}
                        placeholder="再输入一次"
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
                  <ArrowLeft size={16} /> 返回
                </button>
                <button type="submit" className="button button--primary">
                  下一步 <ArrowRight size={16} />
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
              <h2>最后，设置你的工作台</h2>
              <p className="setup__lead">这些是系统的初始策略，之后可以由管理员随时修改。</p>

              <div className="setup__form">
                <label className="field">
                  <span className="field__label">站点名称</span>
                  <span className="field__control">
                    <Globe2 size={16} className="field__icon" />
                    <input
                      value={siteName}
                      onChange={(event) => setSiteName(event.target.value)}
                      placeholder="例如：Yinx 的邮箱"
                      maxLength={60}
                      required
                    />
                  </span>
                </label>

                <label className="switch-row">
                  <span className="switch-row__text">
                    <strong>允许公开注册</strong>
                    <small>关闭后只有管理员能创建账号；个人自托管建议保持关闭。</small>
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
                    <strong>启用演示邮箱</strong>
                    <small>在登录页显示「用演示邮箱直接体验」，方便预览界面。</small>
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
                    <span>管理员</span>
                    <strong>{name || '未填写'}</strong>
                    <small>{email || '未填写'}</small>
                  </div>
                  <div>
                    <span>公开注册</span>
                    <strong>{allowRegistration ? '允许' : '关闭'}</strong>
                  </div>
                  <div>
                    <span>演示模式</span>
                    <strong>{demoEnabled ? '开启' : '关闭'}</strong>
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
                  <ArrowLeft size={16} /> 返回
                </button>
                <button type="submit" className="button button--primary" disabled={busy}>
                  {busy ? <Spinner /> : <ShieldCheck size={16} />}
                  完成初始化
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
              <h2>系统已就绪。</h2>
              <p className="setup__lead">
                {siteName} 已完成初始化。你现在以管理员身份登录，可以开始添加第一个邮箱了。
              </p>
              <div className="setup__done-grid">
                <div>
                  <span>站点</span>
                  <strong>{siteName}</strong>
                </div>
                <div>
                  <span>管理员</span>
                  <strong>{email}</strong>
                </div>
                <div>
                  <span>公开注册</span>
                  <strong>{allowRegistration ? '已开启' : '已关闭'}</strong>
                </div>
                <div>
                  <span>演示模式</span>
                  <strong>{demoEnabled ? '已开启' : '已关闭'}</strong>
                </div>
              </div>
              <div className="setup__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => navigate('/app')}
                >
                  <Users size={16} /> 进入邮箱工作台
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
