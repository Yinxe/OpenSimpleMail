import type { ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

interface AuthLayoutProps {
  children: ReactNode
  version?: string
}

export function AuthLayout({ children, version }: AuthLayoutProps) {
  const { t } = useI18n()
  return (
    <div className="auth">
      <aside className="auth__brand">
        <div className="auth__brand-top">
          <Logo />
        </div>
        <div className="auth__pitch">
          <p className="eyebrow">SELF-HOSTED · OPEN SOURCE</p>
          <h1>
            {t('auth.tagline1')}
            <br />
            {t('auth.tagline2')}
          </h1>
          <p className="auth__lead">{t('auth.lede')}</p>
          <ul className="auth__features">
            <li>{t('auth.feature1')}</li>
            <li>{t('auth.feature2')}</li>
            <li>{t('auth.feature3')}</li>
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
