import { expect, test } from '@playwright/test'
import { catalogs, resolveLocale, supportedLocales, translate } from '../../packages/i18n/src/index'
import localeCases from '../../packages/i18n/locale-cases.json' with { type: 'json' }
import { checkAccessibility } from './accessibility'
import { mockTauri } from './tauri-mock'

test('language matching and complete messages follow the shared native contract', () => {
  expect(translate('zh-CN', 'appName')).toBe('简单复制')
  expect(translate('zh-TW', 'appName')).toBe('簡單複製')
  for (const { languages, expected } of localeCases) expect(resolveLocale(languages), languages.join(', ')).toBe(expected)
  const placeholders = (value: string) => [...value.matchAll(/\{\w+\}/g)].map(([match]) => match).sort()
  for (const [locale, messages] of Object.entries(catalogs)) {
    expect(Object.keys(messages).sort(), locale).toEqual(Object.keys(catalogs.en).sort())
    for (const key of Object.keys(catalogs.en) as (keyof typeof catalogs.en)[]) {
      expect(messages[key].trim(), `${locale}: ${key}`).not.toBe('')
      expect(placeholders(messages[key]), `${locale}: ${key}`).toEqual(placeholders(catalogs.en[key]))
    }
    expect(messages['native.quit'], locale).toContain(messages.appName)
    expect(messages['site.title'], locale).toContain(messages.appName)
    expect(messages['site.description'], locale).toContain(messages.appName)
  }
  // Content with placeholder-like text is inserted once and remains unchanged.
  expect(translate('en', 'pasteLabel', { kind: 'Plain text', text: '<b>{kind}</b>' })).toBe('Paste Plain text: <b>{kind}</b>')
})

for (const locale of supportedLocales) {
  test(`native ${locale} controls the settings language, save and validation`, async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 480 })
    await mockTauri(page, { systemLocale: locale })
    await page.goto('http://127.0.0.1:1421/?view=settings')
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page).toHaveTitle(`${translate(locale, 'settings')} · ${translate(locale, 'appName')}`)
    await expect(page.getByRole('region', { name: translate(locale, 'preferences'), exact: true })).toBeVisible()
    const expiry = page.getByRole('spinbutton', { name: translate(locale, 'expiry'), exact: true })
    await expect(expiry).toHaveValue('86400')
    await expiry.fill('0')
    await expiry.press('Tab')
    await expect(page.locator('#expiry-error')).toHaveText(translate(locale, 'expiryError'))
    await expiry.fill('172800')
    await expiry.press('Enter')
    await expect.poll(() => page.evaluate(() => window.inspection.snapshot.settings.expirySeconds)).toBe(172800)
    await page.getByRole('checkbox', { name: translate(locale, 'format.link'), exact: true }).uncheck()
    await expect(page.getByRole('status', { name: translate(locale, 'saveStatus') })).toContainText(translate(locale, 'saved'))
    expect(await page.locator('.format-choice[data-format="files"]').evaluate((element) => {
      const text = document.createRange()
      text.selectNodeContents(element.querySelector('.format-title')!)
      const lines = [...text.getClientRects()].filter((box) => box.width > 0)
      return lines.length === 1 && lines[0].right <= element.querySelector('[data-slot="checkbox"]')!.getBoundingClientRect().left
    })).toBe(true)
    const delay = page.getByRole('spinbutton', { name: translate(locale, 'restoreDelay') })
    await delay.fill('0')
    await expect(delay).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('#delay-error')).toHaveText(translate(locale, 'delayError'))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.locator('.settings-form').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    if (['de', 'ja', 'zh-TW'].includes(locale)) await checkAccessibility(page)
    if (['de', 'ja'].includes(locale)) {
      await page.getByRole('region', { name: translate(locale, 'preferences'), exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `.artifacts/i18n-settings-${locale}.png` })
    }
    await page.goto('http://127.0.0.1:1421')
    await expect(page).toHaveTitle(translate(locale, 'appName'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(translate(locale, 'appName'))
  })

  test(`website ${locale} and its shared demo use the same language`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.addInitScript((language) => {
      Object.defineProperty(navigator, 'languages', { value: [language], configurable: true })
    }, locale)
    await page.goto('http://127.0.0.1:4174')
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page).toHaveTitle(translate(locale, 'site.title'))
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', translate(locale, 'site.description'))
    await expect(page.locator('.brand span')).toHaveText([translate(locale, 'appName'), translate(locale, 'appName')])
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', translate(locale, 'appName'))
    await expect(page.locator('.demo-window')).toHaveAttribute('title', `${translate(locale, 'appName')} · ${translate(locale, 'site.demo')}`)
    const demo = page.frameLocator('.demo-window')
    await expect(demo.locator('html')).toHaveAttribute('lang', locale)
    await expect(demo.getByRole('heading', { level: 1 })).toHaveText(translate(locale, 'appName'))
    await expect(demo.locator('head title')).toHaveJSProperty('textContent', `${translate(locale, 'site.demo')} · ${translate(locale, 'appName')}`)
    await demo.locator('.clip-main').nth(1).click()
    await expect(page.locator('.note-text')).toHaveText(translate(locale, 'site.sampleNote'))
    await demo.getByRole('button', { name: translate(locale, 'settings'), exact: true }).click()
    await demo.getByRole('button', { name: translate(locale, 'dismiss'), exact: true }).click()
    await expect(demo.locator('.clip-card')).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (['de', 'ja', 'pt'].includes(locale)) await page.screenshot({ path: `.artifacts/i18n-website-${locale}.png`, fullPage: true })
  })
}

test('unsupported website languages fall back to English and preferences update without reload', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { value: ['it-IT', 'nl-NL'], configurable: true })
  })
  await page.goto('http://127.0.0.1:4174')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toHaveCount(1)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'languages', { value: ['it-IT', 'fr-CA'], configurable: true })
    dispatchEvent(new Event('languagechange'))
  })
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(page).toHaveTitle(translate('fr', 'site.title'))
  await expect(page.locator('.brand span')).toHaveText([translate('fr', 'appName'), translate('fr', 'appName')])
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', translate('fr', 'appName'))
  await expect(page.getByRole('link', { name: translate('fr', 'site.skip') })).toHaveCount(1)
})

test('language selection persists, returns to system and follows only current native snapshots', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 480 })
  await mockTauri(page, { systemLocale: 'zh-CN', settings: { language: 'ja' } })
  await page.goto('http://127.0.0.1:1421/?view=settings')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  const selector = page.getByRole('combobox', { name: translate('ja', 'language'), exact: true })
  await expect(selector).toHaveText('日本語')
  const triggerBox = (await selector.boundingBox())!
  await selector.press('Enter')
  const popup = page.getByRole('listbox')
  await expect(popup.getByRole('option')).toHaveCount(11)
  const popupBox = (await popup.boundingBox())!
  expect(Math.abs(triggerBox.width - popupBox.width)).toBeLessThanOrEqual(1)
  expect(popupBox.x).toBeGreaterThanOrEqual(0)
  expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(400)
  await expect(page.getByRole('option', { name: '日本語', exact: true })).toBeFocused()
  await expect(page.locator('#root')).toHaveAttribute('inert', '')
  await checkAccessibility(page, { popup: true })
  await page.screenshot({ path: '.artifacts/settings-language-menu.png' })
  await page.getByRole('option', { name: '日本語', exact: true }).press('Home')
  await expect(page.getByRole('option', { name: translate('ja', 'language.system'), exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('option', { name: 'English', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveTitle('Settings · Simple Copy')
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '')
  await expect(page.getByRole('combobox', { name: 'Language', exact: true })).toBeFocused()
  await checkAccessibility(page)
  expect(await page.evaluate(() => window.inspection.snapshot.settings.language)).toBe('en')
  await page.getByRole('combobox', { name: 'Language', exact: true }).click()
  await page.getByRole('option', { name: 'Follow system', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  const stale = await page.evaluate(() => structuredClone(window.inspection.snapshot))
  await page.evaluate(() => {
    window.inspection.snapshot.settings.language = 'de'
    window.inspection.publish()
  })
  await expect(page).toHaveTitle(`${translate('de', 'settings')} · ${translate('de', 'appName')}`)
  await expect(page.getByRole('heading', { name: translate('de', 'settings'), exact: true })).toBeVisible()
  await page.evaluate((snapshot) => window.inspection.emit('clipboard-state', snapshot), stale)
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(page.getByRole('combobox', { name: translate('de', 'language'), exact: true })).toHaveText('Deutsch')
})

test('a failed language save keeps the confirmed locale and can be retried', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 640 })
  await mockTauri(page, { saveDelay: 100, saveFailures: 1 })
  await page.goto('http://127.0.0.1:1421/?view=settings')
  await page.getByRole('combobox', { name: '语言', exact: true }).click()
  await page.getByRole('option', { name: 'English', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('设置保存失败，请重试。')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByRole('combobox', { name: '语言', exact: true })).toHaveText('跟随系统')
  expect(await page.evaluate(() => window.inspection.snapshot.settings.language)).toBe('system')
  await page.getByRole('combobox', { name: '语言', exact: true }).click()
  await page.getByRole('option', { name: 'English', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('status', { name: 'Settings save status' })).toContainText('Settings saved')
})

test('native locale lookup failures use English even when the browser language is Chinese', async ({ page }) => {
  await mockTauri(page, { systemLocaleFailure: true })
  await page.goto('http://127.0.0.1:1421')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveTitle('Simple Copy')
  await expect(page.getByRole('heading', { name: 'Simple Copy', exact: true })).toBeVisible()
  const search = page.getByRole('searchbox', { name: 'Search clipboard' })
  await search.fill('PLAIN TEXT')
  await expect(page.locator('.clip-card')).toHaveCount(1)
  await search.fill('not a matching query')
  await expect(page.getByRole('heading', { name: 'No matching records' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(search).toBeFocused()
})
