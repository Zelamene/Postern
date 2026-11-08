import { expect, test } from '@playwright/test'

test('visitor changes the theme and keeps the choice after reload', async ({ page }) => {
  await page.goto('/')
  const themeButton = page.getByRole('button', { name: /Switch to (dark|light) mode/ })
  await themeButton.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})
