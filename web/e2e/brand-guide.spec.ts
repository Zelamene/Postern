import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('has no WCAG 2.2 AA accessibility violations', async ({ page }) => {
  await page.goto('/brand/')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('A small gate')

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()

  expect(results.violations).toEqual([])
})

test('has no WCAG 2.2 AA violations in dark mode either', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/brand/')

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()

  expect(results.violations).toEqual([])
})

test('dark mode is a mapped role set, not a filtered page', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/brand/')

  const root = page.locator('html')
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  const lightBg = await bg()

  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(root).toHaveAttribute('data-theme', 'dark')

  const darkBg = await bg()
  expect(darkBg).not.toBe(lightBg)

  const panes = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.polarity__pane')].map(
      (pane) => getComputedStyle(pane).backgroundColor,
    ),
  )
  expect(panes).toHaveLength(2)
  expect(panes[0]).not.toBe(panes[1])

  await page.reload()
  await expect(root).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: 'Auto' }).click()
  await expect(root).not.toHaveAttribute('data-theme')
})

test('documents the token values that the stylesheet actually defines', async ({ page }) => {
  await page.goto('/brand/')

  const audit = page.locator('#token-audit')
  await expect(audit).toHaveAttribute('data-state', 'pass')
  await expect(page.locator('#token-audit-count')).toContainText('in sync')
})
