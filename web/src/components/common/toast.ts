import { createContext, useContext } from 'react'

export type ToastKind = 'success' | 'error'

export interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
}

const noop = () => undefined
export const NOOP_TOAST_API: ToastApi = { success: noop, error: noop }

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_TOAST_API
}
