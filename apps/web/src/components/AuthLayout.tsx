import type { ReactNode } from 'react'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

interface AuthLayoutProps {
  children: ReactNode
  version?: string
}

export function AuthLayout({ children, version }: AuthLayoutProps) {
  return (
    <div className="auth">
      <aside className="auth__brand">
        <div className="auth__brand-top">
          <Logo />
        </div>
        <div className="auth__pitch">
          <p className="eyebrow">SELF-HOSTED · OPEN SOURCE</p>
          <h1>
            把所有邮箱，
            <br />
            收进一个安静的地方。
          </h1>
          <p className="auth__lead">
            一个界面管理多个 IMAP 邮箱。没有广告，没有追踪，数据留在你自己的服务器上。
          </p>
          <ul className="auth__features">
            <li>多账号统一收件箱</li>
            <li>标准 IMAP / SMTP，兼容主流邮箱</li>
            <li>凭据加密存储，会话 HttpOnly</li>
          </ul>
        </div>
        <footer className="auth__brand-foot">
          <span>MIT License</span>
          {version ? <span>v{version}</span> : null}
        </footer>
      </aside>
      <main className="auth__panel">
        <div className="auth__toolbar">
          <ThemeToggle />
        </div>
        <div className="auth__form">{children}</div>
      </main>
    </div>
  )
}
