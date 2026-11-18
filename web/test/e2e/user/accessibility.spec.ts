import { randomUUID } from 'node:crypto'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { analyzePage } from '../support/a11y'
import { EXPECTED_PROPAGATION } from '../support/freshnessCopy'

async function focusByKeyboard(page: Page, locator: Locator, maxTabs = 80) {
  for (let index = 0; index < maxTabs; index += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) {
      return
    }
    await page.keyboard.press('Tab')
  }
  throw new Error(`Keyboard focus never reached ${locator.toString()}`)
}

test('signed-in app has no WCAG 2.2 AA violations', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByText(EXPECTED_PROPAGATION)).toBeVisible()

  const results = await analyzePage(page)
  expect(results.violations).toEqual([])
})

test('a core alias journey is operable by keyboard alone', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByText(EXPECTED_PROPAGATION)).toBeVisible()

  const label = `keyboard-${randomUUID().slice(0, 8)}`
  const labelInput = page.getByLabel('Label')
  await focusByKeyboard(page, labelInput)
  await expect(labelInput).toBeFocused()
  await page.keyboard.type(label)

  const submit = page.getByRole('button', { name: 'Create alias' })
  await focusByKeyboard(page, submit)
  await expect(submit).toBeFocused()
  await page.keyboard.press('Enter')

  const row = page.getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) })
  await expect(row).toBeVisible()
})
