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

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  detail?: string
}

interface ToastContextValue {
  push: (toast: Omit<ToastItem, 'id'>) => void
  success: (title: string, detail?: string) => void
  error: (title: string, detail?: string) => void
  info: (title: string, detail?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
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
      window.setTimeout(() => remove(id), toast.kind === 'error' ? 7000 : 4200)
    },
    [remove],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, detail) => push({ kind: 'success', title, detail }),
      error: (title, detail) => push({ kind: 'error', title, detail }),
      info: (title, detail) => push({ kind: 'info', title, detail }),
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
              <button
                type="button"
                className="toast__close"
                onClick={() => remove(toast.id)}
                aria-label="关闭提示"
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
