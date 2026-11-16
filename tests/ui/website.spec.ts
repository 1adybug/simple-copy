import { expect, test } from '@playwright/test'
import { checkAccessibility } from './accessibility'

const websiteUrl = 'http://127.0.0.1:4174'

test('keyboard users can skip the header and use the demo', async ({ page }) => {
  await page.goto(websiteUrl)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  const clips = page.locator('.demo-paste')
  await clips.first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(clips.nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.note-text')).toHaveText('周五下午三点，带上新提案见面。')
  await page.locator('.demo-pin').nth(1).click()
  await expect(clips.first()).toContainText('周五下午三点')
  await page.getByRole('button', { name: '重置演示' }).click()
  await expect(clips.first()).toContainText('留一点空间')
  await expect(page.locator('.demo-disclaimer')).toHaveText('仅使用示例内容，不读取系统剪贴板。')
})

test('command copying announces success and supports manual recovery on failure', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true })
  })
  await page.goto(websiteUrl)
  await page.getByRole('button', { name: '复制命令' }).click()
  await expect(page.locator('.copy-status')).toHaveText('构建命令已复制到剪贴板。')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Denied') } } })
  })
  await page.getByRole('button', { name: '已复制' }).click()
  await expect(page.locator('.copy-status')).toHaveText('无法自动复制，请选中上方命令手动复制。')
})

test('phone layout keeps touch actions large and content inside the viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await page.goto(websiteUrl)
    const targets = page.locator('.demo-pin, .demo-toolbar button, .copy-command, .header-download')
    for (const target of await targets.all()) {
      const box = (await target.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto')
    await page.locator('.demo-pin').nth(1).tap()
    await expect(page.locator('.demo-paste').first()).toContainText('周五下午三点')
    await checkAccessibility(page)
    await page.screenshot({ path: '.artifacts/optimization-website-mobile-after.png' })
  } finally {
    await context.close()
  }
})

test('desktop website has no automated accessibility violations', async ({ page }) => {
  await page.goto(websiteUrl)
  await checkAccessibility(page)
  await page.screenshot({ path: '.artifacts/optimization-website-after.png' })
})
