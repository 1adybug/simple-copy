import { expect, test } from '@playwright/test'
import { translate } from '../../packages/i18n/src/index'
import { checkAccessibility } from './accessibility'
import { mockTauri } from './tauri-mock'

const settingsUrl = 'http://127.0.0.1:1421/?view=settings'
test.use({ viewport: { width: 400, height: 560 } })

test('manual updates show the shipped version, prevent duplicates and expose download progress', async ({ page }) => {
  await mockTauri(page, { updateDelay: 300 })
  await page.goto(settingsUrl)
  const region = page.getByRole('region', { name: '软件更新', exact: true })
  await region.scrollIntoViewIfNeeded()
  await expect(region).toContainText('当前版本：0.1.0')
  const check = region.getByRole('button', { name: '检查更新', exact: true })
  await check.click()
  await expect(check).toBeDisabled()
  await expect(region.getByRole('status')).toHaveText('正在检查更新…')
  await expect(region).toContainText('发现新版本 0.2.0')
  const install = region.getByRole('button', { name: '下载并安装', exact: true })
  await install.click()
  await expect(check).toBeDisabled()
  await expect(install).toBeDisabled()
  await expect(region.getByRole('progressbar')).toHaveAttribute('value', '1024')
  await expect(region.getByRole('status')).toContainText('正在安装更新')
  const commands = await page.evaluate(() => window.inspection.calls.map((call) => call.command))
  expect(commands.filter((command) => command === 'check_for_updates')).toHaveLength(1)
  expect(commands.filter((command) => command === 'install_update')).toHaveLength(1)
  await checkAccessibility(page)
})

test('checks recover after network failures and report when no update exists', async ({ page }) => {
  await mockTauri(page, { updateFailures: 1, updateVersion: null })
  await page.goto(settingsUrl)
  const check = page.getByRole('button', { name: '检查更新', exact: true })
  await check.click()
  await expect(page.getByRole('alert')).toContainText('检查更新失败，请检查网络后重试。')
  await expect(check).toBeEnabled()
  await check.click()
  await expect(page.locator('.update-status')).toHaveText('已是最新版本。')
  await expect(page.getByRole('button', { name: '下载并安装' })).toHaveCount(0)
})

for (const failure of ['downloadFailed', 'installFailed'] as const) {
  test(`${failure} keeps the version available for retry`, async ({ page }) => {
    await mockTauri(page, { installFailure: failure })
    await page.goto(settingsUrl)
    await page.getByRole('button', { name: '检查更新', exact: true }).click()
    const install = page.getByRole('button', { name: '下载并安装', exact: true })
    await install.click()
    await expect(page.getByRole('alert')).toHaveText(translate('zh-CN', `updates.${failure}`))
    await expect(install).toBeEnabled()
    await install.click()
    await expect.poll(() => page.evaluate(() => window.inspection.calls.filter((call) => call.command === 'install_update').length)).toBe(2)
  })
}

test('automatic updates persist through the existing queue, roll back failed saves and follow native changes', async ({ page }) => {
  await mockTauri(page, { saveFailures: 1 })
  await page.goto(settingsUrl)
  const toggle = page.getByRole('switch', { name: '自动更新', exact: true })
  await expect(toggle).not.toBeChecked()
  await toggle.press('Space')
  await expect(page.getByRole('alert')).toContainText('设置保存失败')
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await expect.poll(() => page.evaluate(() => window.inspection.snapshot.settings.autoUpdate)).toBe(true)
  await page.evaluate(() => { window.inspection.snapshot.settings.autoUpdate = false; window.inspection.publish() })
  await expect(toggle).not.toBeChecked()
})

test('manual installation waits for a pending settings save', async ({ page }) => {
  await mockTauri(page, { saveDelay: 400 })
  await page.goto(settingsUrl)
  await page.getByRole('button', { name: '检查更新', exact: true }).click()
  await page.getByRole('switch', { name: '自动更新', exact: true }).click()
  await page.getByRole('button', { name: '下载并安装', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.inspection.calls.some((call) => call.command === 'install_update'))).toBe(true)
  expect(await page.evaluate(() => window.inspection.snapshot.settings.autoUpdate)).toBe(true)
})

test('a late initial snapshot cannot overwrite a newer native update event', async ({ page }) => {
  await mockTauri(page, { updateSnapshotDelay: 350 })
  await page.goto(settingsUrl)
  await expect.poll(() => page.evaluate(() => window.inspection.calls.some((call) => call.command === 'update_snapshot'))).toBe(true)
  await page.evaluate(() => {
    window.inspection.updates.status = 'available'
    window.inspection.updates.version = '0.3.0'
    window.inspection.publishUpdates()
  })
  await expect(page.locator('.update-status')).toContainText('0.3.0')
  await page.waitForTimeout(450)
  await expect(page.locator('.update-status')).toContainText('0.3.0')
})

test('unavailable builds disable update controls', async ({ page }) => {
  await mockTauri(page, { updates: { status: 'unavailable' } })
  await page.goto(settingsUrl)
  await expect(page.locator('.update-status')).toHaveText('此版本暂不支持在线更新。')
  await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeDisabled()
  await expect(page.getByRole('switch', { name: '自动更新', exact: true })).toBeDisabled()
})

test('failed initial status loading offers a working retry', async ({ page }) => {
  await mockTauri(page, { updateSnapshotFailure: true })
  await page.goto(settingsUrl)
  await expect(page.getByRole('alert')).toContainText('无法加载更新状态')
  await page.getByRole('combobox', { name: '语言', exact: true }).click()
  await page.getByRole('option', { name: 'English', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(translate('en', 'updates.connectionFailed'))
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click()
  await expect(page.locator('.update-status')).toContainText('Version 0.2.0 is available')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

for (const locale of ['ja', 'de', 'fr', 'ru'] as const) {
  test(`${locale} update actions fit a narrow window and use the active locale`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 520 })
    await mockTauri(page, { systemLocale: locale })
    await page.goto(settingsUrl)
    await page.getByRole('button', { name: translate(locale, 'updates.check'), exact: true }).click()
    const region = page.getByRole('region', { name: translate(locale, 'updates.title'), exact: true })
    await region.scrollIntoViewIfNeeded()
    await expect(region).toContainText(translate(locale, 'updates.available', { version: '0.2.0' }))
    await expect(region.getByRole('switch', { name: translate(locale, 'updates.automatic'), exact: true })).toBeEnabled()
    expect(await page.locator('.settings-form').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await checkAccessibility(page)
    await page.screenshot({ path: `.artifacts/updates-${locale}.png` })
  })
}
