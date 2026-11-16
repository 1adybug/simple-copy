import { expect, test } from '@playwright/test'
import { catalogs, resolveLocale, supportedLocales, translate } from '../../packages/i18n/src/index'
import localeCases from '../../packages/i18n/locale-cases.json' with { type: 'json' }
import { checkAccessibility } from './accessibility'
import { mockTauri } from './tauri-mock'

test('language matching and complete messages follow the shared native contract', () => {
  for (const { languages, expected } of localeCases) expect(resolveLocale(languages), languages.join(', ')).toBe(expected)
  const placeholders = (value: string) => [...value.matchAll(/\{\w+\}/g)].map(([match]) => match).sort()
  for (const [locale, messages] of Object.entries(catalogs)) {
    expect(Object.keys(messages).sort(), locale).toEqual(Object.keys(catalogs.en).sort())
    for (const key of Object.keys(catalogs.en) as (keyof typeof catalogs.en)[]) {
      expect(messages[key].trim(), `${locale}: ${key}`).not.toBe('')
      expect(placeholders(messages[key]), `${locale}: ${key}`).toEqual(placeholders(catalogs.en[key]))
    }
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
    await expect(page).toHaveTitle(`${translate(locale, 'settings')} · Simple Copy`)
    await expect(page.getByRole('heading', { name: translate(locale, 'preferences'), exact: true })).toBeVisible()
    await page.getByRole('checkbox', { name: translate(locale, 'format.link'), exact: true }).uncheck()
    await expect(page.locator('.settings-status')).toContainText(translate(locale, 'saved'))
    const delay = page.getByRole('spinbutton', { name: translate(locale, 'restoreDelay') })
    await delay.fill('0')
    await expect(delay).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('#delay-error')).toHaveText(translate(locale, 'delayError'))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.locator('.settings-form').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    if (['de', 'ja', 'zh-TW'].includes(locale)) await checkAccessibility(page)
    if (['de', 'ja'].includes(locale)) {
      await page.locator('#preferences-heading').scrollIntoViewIfNeeded()
      await page.screenshot({ path: `.artifacts/i18n-settings-${locale}.png` })
    }
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
    const demo = page.frameLocator('.demo-window')
    await expect(demo.locator('html')).toHaveAttribute('lang', locale)
    await expect(demo.getByRole('heading', { level: 1 })).toHaveText(translate(locale, 'clipboard'))
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
  await expect(page.getByRole('link', { name: translate('fr', 'site.skip') })).toHaveCount(1)
})

test('native locale lookup failures use English even when the browser language is Chinese', async ({ page }) => {
  await mockTauri(page, { systemLocaleFailure: true })
  await page.goto('http://127.0.0.1:1421')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { name: 'Clipboard', exact: true })).toBeVisible()
  const search = page.getByRole('searchbox', { name: 'Search clipboard' })
  await search.fill('PLAIN TEXT')
  await expect(page.locator('.clip-card')).toHaveCount(1)
  await search.fill('not a matching query')
  await expect(page.getByRole('heading', { name: 'No matching records' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(search).toBeFocused()
})
