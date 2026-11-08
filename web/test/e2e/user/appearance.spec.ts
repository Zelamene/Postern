import { expect, test } from '@playwright/test'

test('changes and remembers the signed-in user theme', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})
