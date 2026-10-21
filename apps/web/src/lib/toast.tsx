import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from './i18n'

type ToastKind = 'success' | 'error' | 'info'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  detail?: string
  action?: ToastAction
}

interface ToastContextValue {
  push: (toast: Omit<ToastItem, 'id'>) => void
  success: (title: string, detail?: string, action?: ToastAction) => void
  error: (title: string, detail?: string, action?: ToastAction) => void
  info: (title: string, detail?: string, action?: ToastAction) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      counter.current += 1
      const id = counter.current
      setToasts((current) => [...current.slice(-3), { ...toast, id }])
      const timeout = toast.action ? 8000 : toast.kind === 'error' ? 7000 : 4200
      window.setTimeout(() => remove(id), timeout)
    },
    [remove],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, detail, action) => push({ kind: 'success', title, detail, action }),
      error: (title, detail, action) => push({ kind: 'error', title, detail, action }),
      info: (title, detail, action) => push({ kind: 'info', title, detail, action }),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast--${toast.kind}`}>
              <span className="toast__icon">
                {toast.kind === 'success' ? (
                  <CheckCircle2 size={18} />
                ) : toast.kind === 'error' ? (
                  <AlertCircle size={18} />
                ) : (
                  <Info size={18} />
                )}
              </span>
              <div className="toast__body">
                <div className="toast__title">{toast.title}</div>
                {toast.detail ? <div className="toast__detail">{toast.detail}</div> : null}
              </div>
              {toast.action ? (
                <button
                  type="button"
                  className="toast__action"
                  onClick={() => {
                    toast.action?.onClick()
                    remove(toast.id)
                  }}
                >
                  {toast.action.label}
                </button>
              ) : null}
              <button
                type="button"
                className="toast__close"
                onClick={() => remove(toast.id)}
                aria-label={t('common.closeToast')}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
