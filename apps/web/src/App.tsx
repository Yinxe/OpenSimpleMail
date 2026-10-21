import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { LoginPage } from '@/pages/LoginPage'
import { MailPage } from '@/pages/MailPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SetupPage } from '@/pages/SetupPage'

function BootScreen() {
  const { t } = useI18n()
  return (
    <div className="boot">
      <Logo />
      <span className="boot__hint">{t('app.loading')}</span>
    </div>
  )
}

function ConnectionProblem() {
  const { t } = useI18n()
  return (
    <div className="boot">
      <Logo />
      <span className="boot__hint">{t('app.backendDown')}</span>
      <button
        type="button"
        className="button button--soft button--sm"
        onClick={() => window.location.reload()}
      >
        {t('app.reload')}
      </button>
    </div>
  )
}

function Protected({ children }: { children: ReactNode }) {
  const { user, config, loading } = useAuth()
  if (loading) return <BootScreen />
  if (!config) return <ConnectionProblem />
  if (!config.initialized) return <Navigate to="/setup" replace />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, config, loading } = useAuth()
  if (loading) return <BootScreen />
  if (!config) return <ConnectionProblem />
  if (!config.initialized) return <Navigate to="/setup" replace />
  if (user) return <Navigate to="/app" replace />
  return <>{children}</>
}

function RootRedirect() {
  const { user, config, loading } = useAuth()
  if (loading) return <BootScreen />
  if (!config) return <ConnectionProblem />
  if (!config.initialized) return <Navigate to="/setup" replace />
  return <Navigate to={user ? '/app' : '/login'} replace />
}

export function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <RegisterPage />
          </PublicOnly>
        }
      />
      <Route
        path="/app"
        element={
          <Protected>
            <MailPage />
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <SettingsPage />
          </Protected>
        }
      />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}
