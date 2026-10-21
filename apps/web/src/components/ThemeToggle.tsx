import { Moon, Sun } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme()
  const { t } = useI18n()
  const next = resolved === 'dark' ? 'light' : 'dark'
  const label = next === 'dark' ? t('theme.toDark') : t('theme.toLight')
  return (
    <button
      type="button"
      className="icon-button icon-button--ghost"
      onClick={() => setTheme(next)}
      title={label}
      aria-label={label}
    >
      {resolved === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}
