import { expect, test } from '@playwright/test'
import { checkAccessibility } from './accessibility'
import { mockTauri } from './tauri-mock'

const desktopUrl = 'http://127.0.0.1:1421'

test.use({ viewport: { width: 360, height: 400 } })

test('long image history loads only nearby previews and releases offscreen blobs', async ({ page }) => {
  await mockTauri(page, { imageCount: 500 })
  await page.goto(desktopUrl)
  await expect(page.locator('.clip-card')).toHaveCount(500)
  await expect(page.locator('.clip-image').first()).toBeVisible()
  const initiallyRequested = await page.evaluate(() => window.inspection.calls.filter((call) => call.command === 'clipboard_thumbnail').length)
  expect(initiallyRequested).toBeLessThanOrEqual(8)
  await test.info().attach('initial-preview-requests', { body: JSON.stringify({ items: 500, requests: initiallyRequested }), contentType: 'application/json' })

  const first = page.locator('.clip-main').first()
  await first.focus()
  await page.keyboard.press('End')
  await expect(page.locator('.clip-main').last()).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.inspection.calls.some((call) => call.command === 'clipboard_thumbnail' && call.args.id === 500))).toBe(true)
  await expect.poll(() => page.evaluate(() => window.inspection.activeUrls.size)).toBeLessThanOrEqual(8)
  const last = await page.locator('.clip-card').last().boundingBox()
  expect(last!.y + last!.height).toBeLessThanOrEqual(389)

  await page.keyboard.press('Home')
  await expect(first).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.inspection.activeUrls.size)).toBeLessThanOrEqual(8)
})

test('slow previews reserve their final height and release blobs when removed', async ({ page }) => {
  await mockTauri(page, { imageCount: 10, thumbnailDelay: 500 })
  await page.goto(desktopUrl)
  const card = page.locator('.clip-card').first()
  await expect(card).toBeVisible()
  const loadingHeight = (await card.boundingBox())!.height
  await expect(page.locator('.clip-image').first()).toBeVisible()
  expect((await card.boundingBox())!.height).toBeCloseTo(loadingHeight, 1)

  await page.evaluate(() => {
    window.inspection.snapshot.items = []
    window.inspection.publish()
  })
  await expect(page.locator('.clip-card')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.inspection.activeUrls.size)).toBe(0)
})

test('late thumbnail responses cannot recreate deleted previews', async ({ page }) => {
  await mockTauri(page, { imageCount: 500, thumbnailDelay: 700 })
  await page.goto(desktopUrl)
  await expect.poll(() => page.evaluate(() => window.inspection.pendingThumbnails)).toBeGreaterThan(0)
  await page.evaluate(() => {
    window.inspection.snapshot.items = []
    window.inspection.publish()
  })
  await expect(page.getByRole('heading', { name: '复制一点内容，从这里开始' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.inspection.pendingThumbnails)).toBe(0)
  expect(await page.evaluate(() => window.inspection.activeUrls.size)).toBe(0)
})

test('failed thumbnail requests keep clipboard actions and keyboard navigation usable', async ({ page }) => {
  await mockTauri(page, { imageCount: 50, thumbnailFailure: true })
  await page.goto(desktopUrl)
  await expect(page.getByText('图片预览暂不可用').first()).toBeVisible()
  await page.locator('.clip-main').first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.clip-main').nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => window.inspection.calls.some((call) => call.command === 'history_action'))).toBe(true)
})

test('settings remain operable while loading and retain their authored select and theme', async ({ page }) => {
  await mockTauri(page, { snapshotDelay: 400 })
  await page.goto(`${desktopUrl}/?view=settings`)
  await expect(page.getByRole('button', { name: '关闭设置' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '主题模式' })).toBeVisible()
  const theme = page.locator('[data-slot="select-trigger"]').first()
  const triggerBox = (await theme.boundingBox())!
  await theme.click()
  const options = page.getByRole('listbox')
  await expect(options).toBeVisible()
  expect(Math.abs((await options.boundingBox())!.width - triggerBox.width)).toBeLessThanOrEqual(1)
  await page.getByRole('option', { name: '深色' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(theme).toBeFocused()
  await checkAccessibility(page)
  await page.screenshot({ path: '.artifacts/optimization-settings-after.png' })
})

test('settings code stays deferred in history and module failures can be retried', async ({ page }) => {
  const settingsRequests: string[] = []
  page.on('request', (request) => {
    if (/\/assets\/SettingsView-[^/]+\.js$/.test(request.url())) settingsRequests.push(request.url())
  })
  await mockTauri(page)
  await page.goto(desktopUrl)
  await expect(page.locator('.clip-card')).toBeVisible()
  expect(settingsRequests).toEqual([])

  await page.route('**/assets/SettingsView-*.js', (route) => route.abort())
  await page.goto(`${desktopUrl}/?view=settings`)
  await expect(page.getByRole('button', { name: '关闭设置' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重新载入' })).toBeVisible()
  await page.unroute('**/assets/SettingsView-*.js')
  await page.getByRole('button', { name: '重新载入' }).click()
  await expect(page.getByRole('combobox', { name: '主题模式' })).toBeVisible()
})

test('history accessibility is preserved with offscreen rendering enabled', async ({ page }) => {
  await mockTauri(page)
  await page.goto(desktopUrl)
  await expect(page.locator('.clip-card')).toBeVisible()
  await checkAccessibility(page)
  await page.screenshot({ path: '.artifacts/optimization-history-after.png' })
})
