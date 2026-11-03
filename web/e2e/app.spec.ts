import { expect, test } from '@playwright/test'

test('renders the Postern homepage', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: /Your inbox, on your terms\./ })).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Try the live demo' })).toBeVisible()
})

test('keeps the header reachable while scrolling', async ({ page }) => {
  await page.goto('/')
  await page.mouse.wheel(0, 2400)

  const header = page.getByRole('banner')
  const box = await header.boundingBox()

  expect(box?.y).toBe(0)
})
