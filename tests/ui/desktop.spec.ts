import { expect, test } from '@playwright/test'
import type { Clip } from '../../apps/desktop/src/native'
import { checkAccessibility } from './accessibility'
import { mockTauri } from './tauri-mock'

const desktopUrl = 'http://127.0.0.1:1421'
const searchItems: Clip[] = [
  { id: 1, kind: 'text', pinned: true, text: 'Hello，中文笔记', hasThumbnail: false, fileCount: 0 },
  { id: 2, kind: 'link', pinned: false, text: 'https://example.com/HELLO', hasThumbnail: false, fileCount: 0 },
  { id: 3, kind: 'files', pinned: false, text: '会议记录.docx', hasThumbnail: false, fileCount: 1 },
  { id: 4, kind: 'image', pinned: false, text: '', hasThumbnail: true, fileCount: 0 },
  { id: 5, kind: 'text', pinned: false, text: '另一条中文笔记', hasThumbnail: false, fileCount: 0 },
]

test.use({ viewport: { width: 360, height: 400 } })

test('search focus stays borderless and keeps the system high-contrast focus indicator', async ({ page }) => {
  await mockTauri(page, { items: searchItems.slice(0, 2), appearance: { accentColor: [0, 120, 212] } })
  await page.goto(desktopUrl)
  const search = page.getByRole('searchbox', { name: '搜索剪贴板' })
  const icon = page.locator('.history-search-icon')
  const restingIcon = await icon.evaluate((svg) => getComputedStyle(svg).color)
  await search.click()
  await expect(search).toBeFocused()
  await expect(search).toHaveCSS('outline-style', 'none')
  await expect(search).toHaveCSS('border-width', '0px')
  await expect(search).toHaveCSS('box-shadow', 'none')
  await expect(icon).not.toHaveCSS('color', restingIcon)
  await search.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(search).toBeFocused()
  await expect(search).toHaveCSS('outline-style', 'none')
  await page.locator('.clip-card').first().hover()
  await page.screenshot({ path: '.artifacts/history-focus-icons.png' })
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(search).toHaveCSS('outline-style', 'solid')
  await checkAccessibility(page)
})

test('search filters previews immediately, follows clipboard updates and clears without changing history', async ({ page }) => {
  await mockTauri(page, { items: searchItems })
  await page.goto(desktopUrl)
  const search = page.getByRole('searchbox', { name: '搜索剪贴板' })
  const cards = page.locator('.clip-card')
  await expect(cards).toHaveCount(5)
  await search.fill('  hello  ')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toContainText('Hello，中文笔记')
  await expect(cards.last()).toContainText('https://example.com/HELLO')
  await page.evaluate(() => {
    window.inspection.snapshot.items.push({ id: 6, kind: 'text', pinned: false, text: 'Hello 新增', hasThumbnail: false, fileCount: 0 })
    window.inspection.publish()
  })
  await expect(cards).toHaveCount(3)
  await page.getByRole('button', { name: '清除未置顶', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText('将移除 5 条未置顶记录')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await search.fill('会议记录')
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText('会议记录.docx')
  await search.fill('图片')
  await expect(cards).toHaveCount(1)
  await expect(cards).toHaveAttribute('data-kind', 'image')
  await search.fill('does-not-match')
  await expect(cards).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '没有匹配的记录' })).toBeVisible()
  await checkAccessibility(page)
  await page.getByRole('button', { name: '清空搜索' }).click()
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()
  await expect(cards).toHaveCount(6)
  expect(await page.evaluate(() => window.inspection.calls.filter((call) => call.command === 'history_action'))).toEqual([])
  await page.screenshot({ path: '.artifacts/history-search.png' })
})

test('search respects IME composition and keyboard actions use only matching history', async ({ page }) => {
  await mockTauri(page, { items: searchItems })
  await page.goto(desktopUrl)
  const search = page.getByRole('searchbox', { name: '搜索剪贴板' })
  await expect(page.locator('.clip-card')).toHaveCount(5)
  await search.focus()
  await search.dispatchEvent('compositionstart')
  await search.fill('zhongwen')
  await expect(page.locator('.clip-card')).toHaveCount(5)
  await search.dispatchEvent('keydown', { key: 'ArrowDown', isComposing: true })
  await search.dispatchEvent('keydown', { key: 'Escape', isComposing: true })
  await expect(search).toBeFocused()
  expect(await page.evaluate(() => window.inspection.calls.some((call) => call.command === 'hide_history'))).toBe(false)
  await search.fill('中文')
  await search.dispatchEvent('compositionend', { data: '中文' })
  await expect(page.locator('.clip-card')).toHaveCount(2)
  await page.keyboard.press('Control+ArrowDown')
  await expect(search).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.clip-main').first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.clip-main').last()).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => window.inspection.calls.find((call) => call.command === 'history_action')?.args.action)).toEqual({ type: 'paste', id: 5 })
  await search.focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '清空搜索' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(search).toBeFocused()
  await expect(page.locator('.clip-card')).toHaveCount(5)
  await search.fill('中文')
  await expect(page.locator('.clip-card')).toHaveCount(2)
  await page.evaluate(() => window.inspection.reopen())
  await expect(search).toHaveValue('')
  await expect(page.locator('.clip-card')).toHaveCount(5)
})

test('search keeps empty history distinct and fits a narrow dark popup', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 400 })
  await mockTauri(page, { items: [] })
  await page.goto(desktopUrl)
  const search = page.getByRole('searchbox', { name: '搜索剪贴板' })
  await search.fill('查找内容')
  await expect(page.getByRole('img', { name: '剪贴板为空' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '没有匹配的记录' })).toHaveCount(0)
  await page.evaluate(() => {
    window.inspection.snapshot.settings.themeMode = 'dark'
    window.inspection.publish()
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await checkAccessibility(page)
  await page.screenshot({ path: '.artifacts/history-search-dark-empty.png' })
})

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
  await expect(page.getByRole('img', { name: '剪贴板为空' })).toBeVisible()
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

test('settings remain operable while loading and expose keyboard-accessible theme choices', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 640 })
  await mockTauri(page, { snapshotDelay: 400 })
  await page.goto(`${desktopUrl}/?view=settings`)
  await expect(page.getByRole('button', { name: '关闭设置' })).toBeVisible()
  const theme = page.getByRole('radiogroup', { name: '明暗模式' })
  await expect(theme).toBeVisible()
  await theme.getByRole('radio', { name: '浅色', exact: true }).focus()
  // Radix moves focus asynchronously; model a physical keypress through that focus event.
  await page.keyboard.press('ArrowRight', { delay: 50 })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(theme.getByRole('radio', { name: '深色', exact: true })).toBeFocused()
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
  await expect(page.getByRole('radiogroup', { name: '明暗模式' })).toBeVisible()
})

test('history accessibility is preserved with offscreen rendering enabled', async ({ page }) => {
  await mockTauri(page)
  await page.goto(desktopUrl)
  await expect(page.locator('.clip-card')).toBeVisible()
  await checkAccessibility(page)
  await page.screenshot({ path: '.artifacts/optimization-history-after.png' })
})
