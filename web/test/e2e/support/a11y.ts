import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

/** WCAG 2.1/2.2 A and AA rules used by every automated scan. */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export function analyzePage(page: Page) {
  return new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
}
