const STORAGE_KEY = 'postern-pending-recovery-key'

export function stashRecoveryKey(recoveryKey: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, recoveryKey)
  } catch (error) {
    console.error('Unable to stage the recovery key for display', error)
  }
}

export function takeRecoveryKey(): string | null {
  try {
    const recoveryKey = window.sessionStorage.getItem(STORAGE_KEY)
    if (recoveryKey !== null) {
      window.sessionStorage.removeItem(STORAGE_KEY)
    }

    return recoveryKey
  } catch (error) {
    console.error('Unable to read the staged recovery key', error)
    return null
  }
}
