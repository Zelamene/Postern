export type ToastKind = 'success' | 'error'

export interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
}
