import { expect, test } from '@playwright/test'
import { checkAccessibility } from './accessibility'
import { mockTauri } from './tauri-mock'

const desktopUrl = 'http://127.0.0.1:1421/'

for (const view of ['history', 'settings'] as const) {
  for (const mode of ['system', 'light', 'dark'] as const) {
    test(`${view}: ${mode} mode keeps following Windows accent and transparency`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light' })
      await mockTauri(page, {
        settings: { themeMode: mode },
        appearance: { accentColor: [0, 120, 215], transparency: true },
      })
      await page.goto(view === 'settings' ? `${desktopUrl}?view=settings` : desktopUrl)
      const root = page.locator('html')
      const scheme = mode === 'dark' ? 'dark' : 'light'
      await expect(root).toHaveAttribute('data-theme', scheme)
      await expect(root).toHaveAttribute('data-transparency', 'true')
      await expect.poll(() => root.evaluate((html) => html.style.getPropertyValue('--sc-primary'))).not.toBe('')
      const primary = await root.evaluate((html) => html.style.getPropertyValue('--sc-primary'))
      await expect.poll(() => page.locator('.app-window').evaluate((app) => getComputedStyle(app).backgroundColor)).toMatch(/0\.78\)$/)
      await page.evaluate(() => {
        window.inspection.appearance.accentColor = [16, 137, 62]
        window.inspection.publishAppearance()
      })
      await expect.poll(() => root.evaluate((html) => html.style.getPropertyValue('--sc-primary'))).not.toBe(primary)
      await expect(root).toHaveAttribute('data-theme', scheme)
      await expect(root).toHaveAttribute('data-transparency', 'true')
      await page.evaluate(() => { window.inspection.appearance.transparency = false; window.inspection.publishAppearance() })
      await expect(root).toHaveAttribute('data-transparency', 'false')
      await expect.poll(() => page.locator('.app-window').evaluate((app) => getComputedStyle(app).backgroundColor)).toMatch(/^rgb\(/)
      expect(await page.evaluate(() => window.inspection.calls.filter((call) => call.command === 'save_settings'))).toHaveLength(0)
      if (view === 'settings') {
        await page.getByRole('radio', { name: mode === 'dark' ? '浅色' : '深色', exact: true }).click()
        await expect(root).toHaveAttribute('data-theme', mode === 'dark' ? 'light' : 'dark')
        await expect.poll(() => root.evaluate((html) => html.style.getPropertyValue('--sc-primary'))).not.toBe('')
        await page.evaluate(() => { window.inspection.appearance.transparency = true; window.inspection.publishAppearance() })
        await expect(root).toHaveAttribute('data-transparency', 'true')
      }
      await checkAccessibility(page)
    })
  }
}

test('a late appearance query cannot undo a newer system event', async ({ page }) => {
  await mockTauri(page, { appearanceDelay: 350, appearance: { accentColor: [0, 120, 215] } })
  await page.goto(desktopUrl)
  await expect.poll(() => page.evaluate(() => window.inspection.pendingAppearance)).toBeGreaterThan(0)
  await page.evaluate(() => {
    window.inspection.appearance.accentColor = [16, 137, 62]
    window.inspection.appearance.transparency = true
    window.inspection.publishAppearance()
  })
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'true')
  const primary = await page.locator('html').evaluate((html) => html.style.getPropertyValue('--sc-primary'))
  await expect.poll(() => page.evaluate(() => window.inspection.pendingAppearance)).toBe(0)
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'true')
  expect(await page.locator('html').evaluate((html) => html.style.getPropertyValue('--sc-primary'))).toBe(primary)
})

test('high contrast overrides custom colors and transparency without changing brightness', async ({ page }) => {
  await mockTauri(page, { settings: { themeMode: 'dark' }, appearance: { accentColor: [0, 120, 215], transparency: true } })
  await page.goto(`${desktopUrl}?view=settings`)
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'true')
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'false')
  await expect.poll(() => page.locator('html').evaluate((html) => html.style.getPropertyValue('--sc-primary'))).toBe('')
  await page.emulateMedia({ forcedColors: 'none' })
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'true')
  await expect.poll(() => page.locator('html').evaluate((html) => html.style.getPropertyValue('--sc-primary'))).not.toBe('')
  await page.evaluate(() => {
    window.inspection.appearance.accentColor = null
    window.inspection.appearance.transparency = false
    window.inspection.publishAppearance()
  })
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'false')
  await expect.poll(() => page.locator('html').evaluate((html) => html.style.getPropertyValue('--sc-primary'))).toBe('')
  await checkAccessibility(page)
})

test('unavailable native appearance leaves a usable solid theme', async ({ page }) => {
  await mockTauri(page, { appearanceFailure: true })
  await page.goto(`${desktopUrl}?view=settings`)
  await page.getByRole('radio', { name: '深色', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'false')
  await expect(page.locator('.settings-status')).toContainText('设置已保存')
  await checkAccessibility(page)
})

test('reduced transparency and motion follow system preferences in a fixed light mode', async ({ page }) => {
  await mockTauri(page, { settings: { themeMode: 'light' }, appearance: { accentColor: [0, 120, 215], transparency: true } })
  await page.goto(`${desktopUrl}?view=settings`)
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'true')
  const primary = await page.locator('html').evaluate((html) => html.style.getPropertyValue('--sc-primary'))
  const client = await page.context().newCDPSession(page)
  await client.send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-transparency', value: 'reduce' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ] })
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'false')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.locator('html').evaluate((html) => html.style.getPropertyValue('--sc-primary'))).toBe(primary)
  await expect(page.getByRole('switch', { name: '恢复置顶内容', exact: true })).toHaveCSS('transition-duration', '1e-05s')
  await client.send('Emulation.setEmulatedMedia', { features: [] })
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'true')
})
