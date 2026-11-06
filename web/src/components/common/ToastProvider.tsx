import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { IconAlertTriangle, IconCheck } from './Icons'
import { ToastContext } from './toast'
import type { ToastApi, ToastKind } from '../../types'

interface Toast {
  id: number
  kind: ToastKind
  message: string
}

const TOAST_DURATION_MS = 4_000

function announceKind(kind: ToastKind): { role: 'status' | 'alert'; live: 'polite' | 'assertive' } {
  if (kind === 'error') {
    return { role: 'alert', live: 'assertive' }
  }

  return { role: 'status', live: 'polite' }
}

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, number>())

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }

    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      nextId.current += 1
      const id = nextId.current
      setToasts((current) => [...current, { id, kind, message }])
      timers.current.set(
        id,
        window.setTimeout(() => remove(id), TOAST_DURATION_MS),
      )
    },
    [remove],
  )

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        window.clearTimeout(timer)
      }
      timers.current.clear()
    },
    [],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section className="toast-viewport" aria-label="Notifications">
        {toasts.map((toast) => {
          const announce = announceKind(toast.kind)
          return (
            <div
              key={toast.id}
              className={`toast ${toast.kind === 'error' ? 'toast--danger' : 'toast--success'}`}
              role={announce.role}
              aria-live={announce.live}
            >
              {toast.kind === 'error' ? (
                <IconAlertTriangle className="toast__icon" />
              ) : (
                <IconCheck className="toast__icon" />
              )}
              <span className="min-w-0 flex-1">{toast.message}</span>
              <button
                type="button"
                className="toast__dismiss"
                aria-label="Dismiss notification"
                onClick={() => remove(toast.id)}
              >
                ×
              </button>
            </div>
          )
        })}
      </section>
    </ToastContext.Provider>
  )
}
