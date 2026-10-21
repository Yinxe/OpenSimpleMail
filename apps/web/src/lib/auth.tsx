import type { AppConfigDto, SetupPayload, UserDto } from '@osm/shared'
import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { ApiError, api } from './api'

interface AuthContextValue {
  user: UserDto | null
  config: AppConfigDto | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  demoLogin: () => Promise<void>
  logout: () => Promise<void>
  setup: (payload: SetupPayload) => Promise<void>
  refreshConfig: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthResponse {
  user: UserDto
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null)
  const [config, setConfig] = useState<AppConfigDto | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const [configResult, meResult] = await Promise.allSettled([
        api.get<AppConfigDto>('/auth/config'),
        api.get<AuthResponse>('/auth/me'),
      ])
      if (cancelled) return
      if (configResult.status === 'fulfilled') setConfig(configResult.value)
      if (meResult.status === 'fulfilled') setUser(meResult.value.user)
      else if (meResult.reason instanceof ApiError && meResult.reason.status === 401) {
        queryClient.clear()
      } else if (!(meResult.reason instanceof ApiError) || meResult.reason.status !== 401) {
        console.warn('Could not load the current session', meResult.reason)
      }
      setLoading(false)
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [queryClient])

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.post<AuthResponse>('/auth/login', { email, password })
      queryClient.clear()
      setUser(result.user)
    },
    [queryClient],
  )

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const result = await api.post<AuthResponse>('/auth/register', { name, email, password })
      queryClient.clear()
      setUser(result.user)
    },
    [queryClient],
  )

  const demoLogin = useCallback(async () => {
    const result = await api.post<AuthResponse>('/auth/demo')
    queryClient.clear()
    setUser(result.user)
  }, [queryClient])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
      queryClient.clear()
    }
  }, [queryClient])

  const setup = useCallback(
    async (payload: SetupPayload) => {
      const result = await api.post<AuthResponse>('/setup', payload)
      queryClient.clear()
      setUser(result.user)
      setConfig((current) =>
        current
          ? {
              ...current,
              initialized: true,
              siteName: payload.siteName,
              allowRegistration: payload.allowRegistration,
              demoEnabled: payload.demoEnabled,
            }
          : current,
      )
    },
    [queryClient],
  )

  const refreshConfig = useCallback(async () => {
    const next = await api.get<AppConfigDto>('/auth/config')
    setConfig(next)
  }, [])

  const value = useMemo(
    () => ({
      user,
      config,
      loading,
      login,
      register,
      demoLogin,
      logout,
      setup,
      refreshConfig,
    }),
    [user, config, loading, login, register, demoLogin, logout, setup, refreshConfig],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
