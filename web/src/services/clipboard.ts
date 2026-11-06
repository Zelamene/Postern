/**
 * Copies text to the clipboard and reports whether it worked.
 *
 * `navigator.clipboard` is missing outside secure contexts and refuses
 * permission in some browsers, so callers must offer a manual fallback
 * (see `selectText`) instead of assuming success.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return false
  }

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Selects an element's text so the user can copy it with the keyboard. */
export function selectText(element: HTMLElement | null): void {
  if (!element) {
    return
  }

  const selection = window.getSelection()
  if (!selection) {
    return
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}
