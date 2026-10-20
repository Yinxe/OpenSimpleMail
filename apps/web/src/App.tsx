import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/lib/auth'
import { LoginPage } from '@/pages/LoginPage'
import { MailPage } from '@/pages/MailPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { SettingsPage } from '@/pages/SettingsPage'

function BootScreen() {
  return (
    <div className="boot">
      <Logo />
      <span className="boot__hint">正在打开邮箱…</span>
    </div>
  )
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <BootScreen />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <BootScreen />
  if (user) return <Navigate to="/app" replace />
  return <>{children}</>
}

export function App() {
  return (
    <Routes>
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
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
