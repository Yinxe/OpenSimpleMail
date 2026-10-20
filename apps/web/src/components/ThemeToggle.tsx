import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme()
  const next = resolved === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="icon-button icon-button--ghost"
      onClick={() => setTheme(next)}
      title={next === 'dark' ? '切换到深色模式' : '切换到浅色模式'}
      aria-label={next === 'dark' ? '切换到深色模式' : '切换到浅色模式'}
    >
      {resolved === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}
