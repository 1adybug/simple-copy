import { expect, test } from '@playwright/test'
import { createDemoClips } from '../../apps/website/src/demo-data'
import { translate } from '../../packages/i18n/src/index'

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
  const tryDemo = page.locator('.hero-actions').getByRole('link', { name: translate('zh-CN', 'site.try'), exact: true })
  await tryDemo.press('Enter')
  await expect(clips.first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(clips.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(clips.first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(clips.nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(demo.locator('.window-feedback').getByRole('status')).toHaveText(translate('zh-CN', 'site.pasted'))
  await demo.getByRole('button', { name: '置顶', exact: true }).first().click()
  await expect(clips.first()).toContainText(translate('zh-CN', 'site.sampleNote'))
  await expect(demo.locator('.clip-card').first()).toHaveAttribute('data-kind', 'richText')
  await tryDemo.click()
  await expect(clips.first()).toBeFocused()
  await expect(clips.first()).toHaveCSS('background-color', 'rgb(121, 61, 145)')
})

test('demo opens the shared settings and restores history and keyboard focus on close', async ({ page }) => {
  await page.goto(websiteUrl)
  const demo = page.frameLocator('.demo-window')
  await expect(demo.locator('.clip-card')).toHaveCount(5)
  const url = page.url()
  const search = demo.getByRole('searchbox', { name: '搜索剪贴板' })
  await search.fill('链接')
  const settings = demo.getByRole('button', { name: '设置', exact: true })
  await settings.press('Enter')
  await expect(demo.locator('.settings-window')).toBeVisible()
  await expect(demo.getByRole('combobox', { name: '语言', exact: true })).toBeVisible()
  await expect(demo.getByRole('button', { name: '关闭设置', exact: true })).toBeFocused()
  await demo.getByRole('button', { name: '关闭设置', exact: true }).click()
  await expect(search).toHaveValue('链接')
  await expect(settings).toBeFocused()
  await settings.press('Space')
  await expect(demo.locator('.settings-window')).toBeVisible()
  await demo.getByRole('button', { name: '关闭设置', exact: true }).press('Escape')
  await expect(settings).toBeFocused()
  await demo.getByRole('button', { name: '收起', exact: true }).click()
  await search.press('Escape')
  await expect(demo.locator('.history-window')).toBeVisible()
  await expect(demo.getByRole('alertdialog')).toHaveCount(0)
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
  await expect(demo.getByRole('alertdialog')).toContainText('清除 4 条未置顶记录。')
  await expect(demo.getByRole('alertdialog').getByRole('button')).toHaveText(['取消', '确定'])
  await demo.getByRole('button', { name: '取消', exact: true }).click()
  await expect(demo.locator('.clip-card')).toHaveCount(5)
  await demo.getByRole('button', { name: '清除未置顶', exact: true }).click()
  await demo.getByRole('button', { name: '确定', exact: true }).click()
  await expect(demo.locator('.clip-card')).toHaveCount(1)
  await expect(demo.getByRole('button', { name: '清除未置顶', exact: true })).toBeDisabled()
  await demo.locator('.clip-main').focus()
  await demo.getByRole('button', { name: '删除', exact: true }).click()
  await expect(demo.getByRole('alertdialog').getByRole('button')).toHaveText(['取消', '确定'])
  await demo.getByRole('button', { name: '确定', exact: true }).click()
  await expect(demo.getByRole('img', { name: '剪贴板为空' })).toBeVisible()
  await page.reload()
  await expect(demo.locator('.clip-card')).toHaveCount(5)
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

test('the website keeps five record types and removes the surrounding demonstration and guide content', async ({ page }) => {
  await page.goto(websiteUrl)
  const demo = page.frameLocator('.demo-window')
  await expect(demo.locator('.clip-card')).toHaveCount(5)
  for (const kind of ['text', 'link', 'richText', 'image', 'files']) {
    await expect(demo.locator(`.clip-card[data-kind="${kind}"]`)).toHaveCount(1)
  }
  expect(await demo.getByRole('img', { name: translate('zh-CN', 'imageAlt') }).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  await expect(demo.locator('.file-label')).toContainText('2')
  await expect(page.locator('.demo-controls, .demo-note, .demo-status, .demo-disclaimer, .workflow, .features-section, .download-section, .build-guide')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重置演示' })).toHaveCount(0)
  await expect(page.locator('.demo-scene')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('a[href="#download"]')).toHaveCount(0)
})

test('settings apply language and theme to the whole website and persist without resetting records', async ({ page }) => {
  await page.goto(websiteUrl)
  const demo = page.frameLocator('.demo-window')
  await demo.getByRole('button', { name: '置顶', exact: true }).first().click()
  await demo.getByRole('button', { name: '设置', exact: true }).click()
  await demo.getByRole('combobox', { name: '语言', exact: true }).click()
  await demo.getByRole('option', { name: 'English', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(demo.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveTitle(translate('en', 'site.title'))
  await expect(page.locator('.brand span')).toHaveText(['Simple Copy', 'Simple Copy'])
  await expect(demo.locator('.settings-window')).toBeVisible()
  await demo.getByRole('combobox', { name: translate('en', 'theme'), exact: true }).click()
  await demo.getByRole('option', { name: translate('en', 'theme.dark'), exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(demo.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(29, 23, 33)')
  await checkAccessibility(page)
  await page.screenshot({ path: '.artifacts/website-settings-dark.png', fullPage: true })
  await demo.getByRole('button', { name: translate('en', 'closeSettings'), exact: true }).click()
  await expect(demo.locator('.clip-card').first()).toHaveAttribute('data-kind', 'richText')
  await expect(demo.locator('.clip-card').first()).toHaveAttribute('data-pinned', 'true')
  await expect(demo.locator('.clip-main').first()).toContainText(translate('en', 'site.sampleNote'))
  await expect(page.locator('.demo-window')).toHaveAttribute('data-view', 'history')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(demo.locator('html')).toHaveAttribute('data-theme', 'dark')
  await demo.getByRole('button', { name: translate('en', 'settings'), exact: true }).click()
  await expect(demo.getByRole('combobox', { name: translate('en', 'language'), exact: true })).toHaveText('English')
  await expect(demo.getByRole('combobox', { name: translate('en', 'theme'), exact: true })).toHaveText(translate('en', 'theme.dark'))
})

test('system preferences remain live and manual settings stay selected until restored to system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(websiteUrl)
  const demo = page.frameLocator('.demo-window')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(demo.locator('html')).toHaveAttribute('data-theme', 'dark')
  await demo.getByRole('button', { name: '设置', exact: true }).click()
  await demo.getByRole('combobox', { name: '明暗模式', exact: true }).click()
  await demo.getByRole('option', { name: translate('zh-CN', 'theme.light'), exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(demo.locator('html')).toHaveAttribute('data-theme', 'light')
  await demo.getByRole('combobox', { name: '明暗模式', exact: true }).click()
  await demo.getByRole('option', { name: translate('zh-CN', 'theme.system'), exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(demo.locator('html')).toHaveAttribute('data-theme', 'light')
  await demo.getByRole('combobox', { name: '语言', exact: true }).click()
  await demo.getByRole('option', { name: 'English', exact: true }).click()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'languages', { value: ['de-DE'], configurable: true })
    dispatchEvent(new Event('languagechange'))
  })
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await demo.getByRole('combobox', { name: 'Language', exact: true }).click()
  await demo.getByRole('option', { name: 'Follow system', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(demo.locator('html')).toHaveAttribute('lang', 'de')
  await expect(demo.locator('.settings-window')).toBeVisible()
})

test('settings still synchronize when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage blocked') }
    Storage.prototype.setItem = () => { throw new Error('Storage blocked') }
  })
  await page.goto(websiteUrl)
  const demo = page.frameLocator('.demo-window')
  await demo.getByRole('button', { name: '设置', exact: true }).click()
  await demo.getByRole('combobox', { name: '语言', exact: true }).click()
  await demo.getByRole('option', { name: 'English', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(demo.locator('.settings-window')).toBeVisible()
  await demo.getByRole('combobox', { name: translate('en', 'theme'), exact: true }).click()
  await demo.getByRole('option', { name: translate('en', 'theme.dark'), exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('the desktop footer reaches the viewport edge and expanding the demo keeps the headline in place', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(websiteUrl)
  const demo = page.frameLocator('.demo-window')
  const settings = demo.getByRole('button', { name: '设置', exact: true })
  await expect(settings).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  const heading = page.getByRole('heading', { level: 1 })
  const documentTop = (element: Element) => element.getBoundingClientRect().top + window.scrollY
  const headingTop = await heading.evaluate(documentTop)
  expect(await page.locator('footer').evaluate((footer) => footer.getBoundingClientRect().bottom)).toBe(900)

  await settings.click()
  await expect(page.locator('.demo-window')).toHaveCSS('height', '640px')
  expect(await heading.evaluate(documentTop)).toBe(headingTop)
})

test('phone layout keeps touch actions large and content inside the viewport', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await page.goto(websiteUrl)
    const demo = page.frameLocator('.demo-window')
    await expect(demo.locator('.clip-card')).toHaveCount(5)
    await expect(page.locator('header').getByRole('link', { name: translate('zh-CN', 'site.getWindows') })).toBeInViewport()
    const targets = [
      ...await page.locator('.site-header a, .hero-actions a, .site-footer a').all(),
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
    await expect(demo.locator('.clip-main').first()).toContainText(translate('zh-CN', 'site.sampleNote'))
    await demo.getByRole('button', { name: '设置', exact: true }).tap()
    await expect(page.locator('.demo-window[data-view="settings"]')).toBeInViewport({ ratio: 0.99 })
    await demo.getByRole('combobox', { name: '语言', exact: true }).tap()
    await expect(demo.getByRole('listbox')).toBeVisible()
    await demo.getByRole('option', { name: 'Deutsch', exact: true }).tap()
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    await expect(demo.locator('.settings-window')).toBeVisible()
    for (const choice of await demo.locator('.format-choice').all()) {
      expect(await choice.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element.querySelector('.format-title')!)
        const lines = [...range.getClientRects()].filter((box) => box.width > 0)
        return lines.length === 1 && lines[0].right <= element.querySelector('[data-slot="checkbox"]')!.getBoundingClientRect().left
      })).toBe(true)
    }
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
    await expect(desktopPage.locator('.clip-main').first()).toBeFocused()
    await page.locator('.hero-actions').getByRole('link', { name: translate('zh-CN', 'site.try'), exact: true }).press('Enter')
    await expect(demo.locator('.clip-main').first()).toBeFocused()
    const selectors = [
      '.app-window', '.window-header', '.window-heading h1', '.header-actions > button',
      '.history-search-input', '.history-list', '.clip-card', '.clip-main', '.clip-text-lines', '.clip-actions > button',
    ]
    const styles = (element: Element) => {
      const computed = getComputedStyle(element)
      return Object.fromEntries([
        'width', 'height', 'padding', 'gap', 'border-radius', 'background-color', 'color',
        'font-family', 'font-size', 'line-height',
      ].map((property) => [property, computed.getPropertyValue(property)]))
    }
    for (const selector of selectors) {
      expect(await demo.locator(selector).first().evaluate(styles), selector)
        .toEqual(await desktopPage.locator(selector).first().evaluate(styles))
    }
    await page.screenshot({ path: '.artifacts/website-shared-panel.png' })
    await desktopPage.screenshot({ path: '.artifacts/desktop-shared-panel.png' })
    await demo.getByRole('button', { name: '设置', exact: true }).click()
    await expect(page.locator('.demo-window')).toHaveAttribute('data-view', 'settings')
    await desktopPage.setViewportSize({ width: 480, height: 640 })
    await desktopPage.goto('http://127.0.0.1:1421/?view=settings')
    await expect(desktopPage.locator('.settings-form')).toBeVisible()
    for (const selector of ['.settings-window', '.settings-scroll', '.settings-panel', '.format-options', '#language', '#theme-mode', '.quantity-input']) {
      expect(await demo.locator(selector).first().evaluate(styles), selector)
        .toEqual(await desktopPage.locator(selector).first().evaluate(styles))
    }
    await page.screenshot({ path: '.artifacts/website-shared-settings.png', fullPage: true })
    await desktopPage.screenshot({ path: '.artifacts/desktop-shared-settings.png' })
  } finally {
    await desktopPage.close()
  }
})

test('desktop website has no automated accessibility violations', async ({ page }) => {
  await page.goto(websiteUrl)
  await checkAccessibility(page)
  await page.screenshot({ path: '.artifacts/optimization-website-after.png' })
})
