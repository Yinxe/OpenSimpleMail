import {
  type AppConfigDto,
  DEFAULT_PREFERENCES,
  type SetupPayload,
  type UpdatePreferencesPayload,
  type UserDto,
  type UserPreferencesDto,
} from '@osm/shared'
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
  preferences: UserPreferencesDto
  loading: boolean
  login: (email: string, password: string) => Promise<string | null>
  loginTotp: (challengeToken: string, code: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  demoLogin: () => Promise<void>
  logout: () => Promise<void>
  recoverAdmin: (email: string, recoveryPassword: string, newPassword: string) => Promise<void>
  setup: (payload: SetupPayload) => Promise<void>
  refreshConfig: () => Promise<void>
  updatePreferences: (payload: UpdatePreferencesPayload) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthResponse {
  user: UserDto
}

interface ChallengeResponse {
  twoFactorRequired: true
  challengeToken: string
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null)
  const [config, setConfig] = useState<AppConfigDto | null>(null)
  const [preferences, setPreferences] = useState<UserPreferencesDto>(DEFAULT_PREFERENCES)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  const loadPreferences = useCallback(async () => {
    try {
      const next = await api.get<UserPreferencesDto>('/preferences')
      setPreferences(next)
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        console.warn('Could not load user preferences', error)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const [configResult, meResult] = await Promise.allSettled([
        api.get<AppConfigDto>('/auth/config'),
        api.get<AuthResponse>('/auth/me'),
      ])
      if (cancelled) return
      if (configResult.status === 'fulfilled') setConfig(configResult.value)
      if (meResult.status === 'fulfilled') {
        setUser(meResult.value.user)
        await loadPreferences()
      } else if (meResult.reason instanceof ApiError && meResult.reason.status === 401) {
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
  }, [loadPreferences, queryClient])

  /** Returns a challenge token when the account has two-factor enabled. */
  const login = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const result = await api.post<AuthResponse | ChallengeResponse>('/auth/login', {
        email,
        password,
      })
      if ('twoFactorRequired' in result) return result.challengeToken
      queryClient.clear()
      setUser(result.user)
      await loadPreferences()
      return null
    },
    [loadPreferences, queryClient],
  )

  const loginTotp = useCallback(
    async (challengeToken: string, code: string) => {
      const result = await api.post<AuthResponse>('/auth/login/totp', { challengeToken, code })
      queryClient.clear()
      setUser(result.user)
      await loadPreferences()
    },
    [loadPreferences, queryClient],
  )

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const result = await api.post<AuthResponse>('/auth/register', { name, email, password })
      queryClient.clear()
      setUser(result.user)
      await loadPreferences()
    },
    [loadPreferences, queryClient],
  )

  const demoLogin = useCallback(async () => {
    const result = await api.post<AuthResponse>('/auth/demo')
    queryClient.clear()
    setUser(result.user)
    await loadPreferences()
  }, [loadPreferences, queryClient])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
      setPreferences(DEFAULT_PREFERENCES)
      queryClient.clear()
    }
  }, [queryClient])

  const recoverAdmin = useCallback(
    async (email: string, recoveryPassword: string, newPassword: string) => {
      const result = await api.post<AuthResponse>('/auth/recover', {
        email,
        recoveryPassword,
        newPassword,
      })
      queryClient.clear()
      setUser(result.user)
      await loadPreferences()
    },
    [loadPreferences, queryClient],
  )

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
      await loadPreferences()
    },
    [loadPreferences, queryClient],
  )

  const refreshConfig = useCallback(async () => {
    const next = await api.get<AppConfigDto>('/auth/config')
    setConfig(next)
  }, [])

  const updatePreferences = useCallback(async (payload: UpdatePreferencesPayload) => {
    const next = await api.patch<UserPreferencesDto>('/preferences', payload)
    setPreferences(next)
  }, [])

  const value = useMemo(
    () => ({
      user,
      config,
      preferences,
      loading,
      login,
      loginTotp,
      register,
      demoLogin,
      logout,
      recoverAdmin,
      setup,
      refreshConfig,
      updatePreferences,
    }),
    [
      user,
      config,
      preferences,
      loading,
      login,
      loginTotp,
      register,
      demoLogin,
      logout,
      recoverAdmin,
      setup,
      refreshConfig,
      updatePreferences,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
