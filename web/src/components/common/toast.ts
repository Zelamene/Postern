import { createContext, useContext } from 'react'
import type { ToastApi } from '../../types'

const noop = () => undefined
export const NOOP_TOAST_API: ToastApi = { success: noop, error: noop }

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_TOAST_API
}
