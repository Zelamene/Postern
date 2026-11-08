import { expect, test } from '@playwright/test'

test('renders the Postern homepage', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: /Your inbox, on your terms\./ })).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('link', { name: 'See how it works' })).toBeVisible()
})

test('selected text keeps a high-contrast foreground in both themes', async ({ page }) => {
  await page.goto('/')

  const selectedColors = () =>
    page.locator('#hero-title + p').evaluate((element) => {
      const selection = getComputedStyle(element, '::selection')
      return { background: selection.backgroundColor, foreground: selection.color }
    })

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light'
  })
  expect(await selectedColors()).toEqual({
    background: 'rgb(116, 23, 42)',
    foreground: 'rgb(255, 255, 255)',
  })

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
  })
  expect(await selectedColors()).toEqual({
    background: 'rgb(176, 69, 84)',
    foreground: 'rgb(255, 255, 255)',
  })
})

test('keeps the header reachable while scrolling', async ({ page }) => {
  await page.goto('/')
  await page.mouse.wheel(0, 2400)

  const header = page.getByRole('banner')
  const box = await header.boundingBox()

  expect(box?.y).toBe(0)
})
