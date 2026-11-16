import { expect, test } from '@playwright/test'
import { createDemoClips } from '../../apps/website/src/demo-data'

const demoClips = createDemoClips('zh-CN')
import { checkAccessibility } from './accessibility'
import { mockTauri } from './tauri-mock'

const websiteUrl = 'http://127.0.0.1:4174'
test.use({ locale: 'zh-CN' })

test('keyboard users can skip the header and use the demo', async ({ page }) => {
  await page.goto(websiteUrl)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  const demo = page.frameLocator('.demo-window')
  const clips = demo.locator('.clip-main')
  await clips.first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(clips.nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.note-text')).toHaveText('周五下午三点，带上新提案见面。')
  await demo.getByRole('button', { name: '置顶', exact: true }).first().click()
  await expect(clips.first()).toContainText('周五下午三点')
  await page.getByRole('button', { name: '重置演示' }).click()
  await expect(clips.first()).toContainText('留一点空间')
  await expect(page.locator('.demo-disclaimer')).toHaveText('仅使用示例内容，不读取系统剪贴板。')
})

test('demo settings and dismiss actions accept clicks and keyboard activation without effects', async ({ page }) => {
  await page.goto(websiteUrl)
  const demo = page.frameLocator('.demo-window')
  await expect(demo.locator('.clip-card')).toHaveCount(3)
  const initial = await demo.locator('.app-window').innerHTML()
  const url = page.url()
  for (const name of ['设置', '收起']) {
    const button = demo.getByRole('button', { name, exact: true })
    await expect(button).toBeEnabled()
    await button.click()
    await button.press('Enter')
    await button.press('Space')
    await expect(demo.locator('.app-window')).toHaveJSProperty('innerHTML', initial)
  }
  await demo.getByRole('searchbox', { name: '搜索剪贴板' }).press('Escape')
  await expect(demo.locator('.app-window')).toBeVisible()
  await expect(demo.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.locator('.note-text')).toHaveText('点击记录，粘贴到这里。')
  expect(page.url()).toBe(url)
  expect(page.context().pages()).toHaveLength(1)
})

test('demo shares search, clear confirmation, deletion and empty states with the desktop', async ({ page }) => {
  await page.goto(websiteUrl)
  const demo = page.frameLocator('.demo-window')
  const search = demo.getByRole('searchbox', { name: '搜索剪贴板' })
  await search.fill('链接')
  await expect(demo.locator('.clip-card')).toHaveCount(1)
  await search.fill('不存在的内容')
  await expect(demo.getByRole('heading', { name: '没有匹配的记录' })).toBeVisible()
  await demo.getByRole('button', { name: '清空搜索' }).click()
  await expect(search).toBeFocused()
  await demo.getByRole('button', { name: '清除未置顶', exact: true }).click()
  await expect(demo.getByRole('alertdialog')).toContainText('清除 2 条未置顶记录。')
  await expect(demo.getByRole('alertdialog').getByRole('button')).toHaveText(['取消', '确定'])
  await demo.getByRole('button', { name: '取消', exact: true }).click()
  await expect(demo.locator('.clip-card')).toHaveCount(3)
  await demo.getByRole('button', { name: '清除未置顶', exact: true }).click()
  await demo.getByRole('button', { name: '确定', exact: true }).click()
  await expect(demo.locator('.clip-card')).toHaveCount(1)
  await expect(demo.getByRole('button', { name: '清除未置顶', exact: true })).toBeDisabled()
  await demo.locator('.clip-main').focus()
  await demo.getByRole('button', { name: '删除', exact: true }).click()
  await expect(demo.getByRole('alertdialog').getByRole('button')).toHaveText(['取消', '确定'])
  await demo.getByRole('button', { name: '确定', exact: true }).click()
  await expect(demo.getByRole('img', { name: '剪贴板为空' })).toBeVisible()
  await page.getByRole('button', { name: '重置演示' }).click()
  await expect(demo.locator('.clip-card')).toHaveCount(3)
  await expect(search).toHaveValue('')
  await checkAccessibility(page)
})

test('demo copies only selected sample text after an explicit click and reports failures', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: () => { throw new Error('Demo must never read the system clipboard') },
        writeText: async (text: string) => { document.documentElement.dataset.copiedSample = text },
      },
    })
  })
  await page.goto(websiteUrl)
  const demo = page.frameLocator('.demo-window')
  await expect(demo.locator('html')).not.toHaveAttribute('data-copied-sample')
  await demo.locator('.clip-main').first().focus()
  await demo.getByRole('button', { name: '复制', exact: true }).first().click()
  await expect(demo.locator('html')).toHaveAttribute('data-copied-sample', demoClips[0].text)
  await expect(demo.locator('.window-feedback').getByRole('status')).toHaveText('示例内容已复制。')
  await demo.locator('html').evaluate(() => {
    navigator.clipboard.writeText = async () => { throw new Error('Denied') }
  })
  await demo.locator('.clip-main').first().focus()
  await demo.getByRole('button', { name: '复制', exact: true }).first().click()
  await expect(demo.getByRole('alert')).toHaveText('无法复制，请重试。')
  await expect(demo.locator('.clip-main').first()).toBeEnabled()
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
    const demo = page.frameLocator('.demo-window')
    await expect(demo.locator('.clip-card')).toHaveCount(3)
    const targets = [
      ...await page.locator('.demo-controls button, .copy-command, .header-download').all(),
      ...await demo.locator('.header-actions > button, .clip-actions > button').all(),
    ]
    for (const target of targets) {
      const box = (await target.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto')
    await demo.getByRole('button', { name: '置顶', exact: true }).first().tap()
    await expect(demo.locator('.clip-main').first()).toContainText('周五下午三点')
    expect(await demo.locator('html').evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await checkAccessibility(page)
    await page.screenshot({ path: '.artifacts/optimization-website-mobile-after.png' })
  } finally {
    await context.close()
  }
})

test('website demonstration and desktop render the same panel geometry and visual styles', async ({ page }) => {
  await page.goto(websiteUrl)
  const demo = page.frameLocator('.demo-window')
  await expect(demo.locator('.clip-card')).toHaveCount(demoClips.length)
  const desktopPage = await page.context().newPage()
  try {
    await desktopPage.setViewportSize({ width: 360, height: 400 })
    await mockTauri(desktopPage, { items: demoClips, settings: { themeMode: 'light' } })
    await desktopPage.goto('http://127.0.0.1:1421')
    await expect(desktopPage.locator('.clip-card')).toHaveCount(demoClips.length)
    const selectors = [
      '.app-window', '.window-header', '.window-heading h1', '.header-actions > button',
      '.history-search-input', '.history-list', '.clip-card', '.clip-main', '.clip-text-lines', '.clip-actions > button',
    ]
    for (const selector of selectors) {
      const styles = (element: Element) => {
        const computed = getComputedStyle(element)
        return Object.fromEntries([
          'width', 'height', 'padding', 'gap', 'border-radius', 'background-color', 'color',
          'font-family', 'font-size', 'line-height',
        ].map((property) => [property, computed.getPropertyValue(property)]))
      }
      expect(await demo.locator(selector).first().evaluate(styles), selector)
        .toEqual(await desktopPage.locator(selector).first().evaluate(styles))
    }
    await page.screenshot({ path: '.artifacts/website-shared-panel.png' })
    await desktopPage.screenshot({ path: '.artifacts/desktop-shared-panel.png' })
  } finally {
    await desktopPage.close()
  }
})

test('desktop website has no automated accessibility violations', async ({ page }) => {
  await page.goto(websiteUrl)
  await checkAccessibility(page)
  await page.screenshot({ path: '.artifacts/optimization-website-after.png' })
})
