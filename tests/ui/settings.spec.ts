import { expect, test } from '@playwright/test'
import { checkAccessibility } from './accessibility'
import { mockTauri } from './tauri-mock'

const settingsUrl = 'http://127.0.0.1:1421/?view=settings'
test.use({ viewport: { width: 480, height: 640 } })

test('new groups retain every setting and rapid format changes save together', async ({ page }) => {
  await mockTauri(page, { saveDelay: 100 })
  await page.goto(settingsUrl)
  for (const name of ['使用偏好', '记录与保存', '自动恢复']) {
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(1)
  }
  await expect(page.getByRole('checkbox')).toHaveCount(5)
  await expect(page.getByRole('combobox', { name: '语言', exact: true })).toHaveCount(1)
  await expect(page.getByRole('spinbutton', { name: '最多保存条数' })).toHaveValue('20')
  const footer = page.locator('.settings-status')
  const footerY = (await footer.boundingBox())!.y
  // The complete tile is a label; one click must produce exactly one change.
  await page.locator('.format-choice[data-format="text"]').click()
  await page.getByRole('checkbox', { name: '链接', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: '富文本', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: '图片', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: '文件与文件夹', exact: true }).uncheck()
  await expect.poll(() => page.evaluate(() => Object.values(window.inspection.snapshot.settings.formats).every((enabled) => !enabled))).toBe(true)
  await expect(footer).toContainText('设置已保存')
  expect((await footer.boundingBox())!.y).toBe(footerY)
  expect(await page.evaluate(() => window.inspection.calls.filter((call) => call.command === 'save_settings').length)).toBe(5)
  await page.getByRole('checkbox', { name: '纯文本', exact: true }).focus()
  await page.keyboard.press('Space')
  await expect.poll(() => page.evaluate(() => window.inspection.snapshot.settings.formats.text)).toBe(true)
  // A native snapshot continues to be the owner of the displayed settings.
  await page.evaluate(() => {
    window.inspection.snapshot.settings.formats.image = true
    window.inspection.publish()
  })
  await expect(page.getByRole('checkbox', { name: '图片', exact: true })).toBeChecked()
})

test('history limit commits only on blur or non-composing Enter and confirms reductions', async ({ page }) => {
  await mockTauri(page, { settings: { maxHistoryItems: 100 } })
  await page.goto(settingsUrl)
  const limit = page.getByRole('spinbutton', { name: '最多保存条数' })
  await limit.fill('60')
  await limit.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  expect(await page.evaluate(() => window.inspection.snapshot.settings.maxHistoryItems)).toBe(100)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await limit.press('Enter')
  await expect(page.getByRole('alertdialog')).toContainText('60 条未置顶记录')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(limit).toHaveValue('100')
  await expect(limit).toBeFocused()
  await limit.fill('60')
  await limit.press('Tab')
  await page.getByRole('button', { name: '减少保存条数', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.inspection.snapshot.settings.maxHistoryItems)).toBe(60)
  await limit.fill('0')
  await limit.press('Enter')
  await expect.poll(() => page.evaluate(() => window.inspection.snapshot.settings.maxHistoryItems)).toBe(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  for (const value of ['', '-1', '1.5', '4294967296']) {
    await limit.fill(value)
    await limit.press('Tab')
    await expect(limit).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('#history-limit-error')).toBeVisible()
    expect(await page.evaluate(() => window.inspection.snapshot.settings.maxHistoryItems)).toBe(0)
  }
  await checkAccessibility(page)
})

test('retention choices confirm disk reductions and restore focus after cancellation', async ({ page }) => {
  await mockTauri(page)
  await page.goto(settingsUrl)
  const retention = page.getByRole('radiogroup', { name: '退出后保留' })
  const all = retention.getByRole('radio', { name: '保留全部', exact: true })
  const session = retention.getByRole('radio', { name: '仅本次运行', exact: true })
  await all.click()
  await expect.poll(() => page.evaluate(() => window.inspection.snapshot.settings.retention)).toBe('all')
  await session.click()
  await expect(page.getByRole('alertdialog')).toContainText('磁盘上的历史')
  await expect(page.getByRole('button', { name: '取消', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(all).toBeChecked()
  await expect(session).toBeFocused()
  await page.keyboard.press('ArrowRight', { delay: 50 })
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '更改保留方式', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.inspection.snapshot.settings.retention)).toBe('pinned')
  await session.click()
  await page.getByRole('button', { name: '更改保留方式', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.inspection.snapshot.settings.retention)).toBe('session')
})

test('restore remains configurable while off, validates seconds and respects platform capability', async ({ page }) => {
  await mockTauri(page, { capabilities: { restoreAvailable: false, message: '当前平台暂不支持常驻恢复。' } })
  await page.goto(settingsUrl)
  const toggle = page.getByRole('switch', { name: '恢复置顶内容', exact: true })
  await expect(toggle).toBeDisabled()
  const delay = page.getByRole('spinbutton', { name: '恢复延迟' })
  await expect(delay).toBeEnabled()
  for (const value of ['0', '3601', '', '1.5']) {
    await delay.fill(value)
    await expect(delay).toHaveAttribute('aria-invalid', 'true')
    expect(await page.evaluate(() => window.inspection.snapshot.settings.restoreSeconds)).toBe(5)
  }
  await delay.fill('3600')
  await expect.poll(() => page.evaluate(() => window.inspection.snapshot.settings.restoreSeconds)).toBe(3600)
  await delay.blur()
  await expect(delay).toHaveAttribute('aria-invalid', 'false')
  await expect(page.getByText('当前平台暂不支持常驻恢复。', { exact: true })).toBeVisible()
  await page.evaluate(() => { window.inspection.snapshot.capabilities.restoreAvailable = true; window.inspection.publish() })
  await toggle.click()
  await expect.poll(() => page.evaluate(() => window.inspection.snapshot.settings.restoreEnabled)).toBe(true)
})

test('theme follows live system changes only in system mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await mockTauri(page)
  await page.goto(settingsUrl)
  await page.getByRole('radio', { name: '深色', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('radio', { name: '跟随系统', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.evaluate(() => { window.inspection.snapshot.settings.shortcut = 'Control+Shift+KeyY'; window.inspection.publish() })
  await expect(page.locator('.shortcut-keys')).toHaveText('CtrlShiftY')
})

test('shortcut recording supports keyboard, native events, cancellation and IME', async ({ page }) => {
  await mockTauri(page)
  await page.goto(settingsUrl)
  const recorder = page.getByRole('button', { name: /^呼出快捷键/ })
  await recorder.click()
  await recorder.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true })
  await expect(recorder).toHaveAttribute('aria-pressed', 'true')
  await recorder.press('Escape')
  await expect(recorder).toHaveAttribute('aria-pressed', 'false')
  await recorder.click()
  await recorder.press('Tab')
  await expect(recorder).not.toBeFocused()
  await expect(recorder).toHaveAttribute('aria-pressed', 'false')
  expect(await page.evaluate(() => window.inspection.calls.filter((call) => call.command === 'save_settings').length)).toBe(0)
  await recorder.click()
  await recorder.press('Control+Shift+Y')
  await expect.poll(() => page.evaluate(() => window.inspection.snapshot.settings.shortcut)).toBe('Control+Shift+KeyY')
  await recorder.click()
  await page.evaluate(() => window.inspection.emit('shortcut-recorded', 'Super+V'))
  await expect.poll(() => page.evaluate(() => window.inspection.snapshot.settings.shortcut)).toBe('Super+V')
  await expect(recorder).toHaveAttribute('aria-pressed', 'false')
})

test('closing waits for automatic saves and a failed save keeps the window open for retry', async ({ page }) => {
  await mockTauri(page, { saveDelay: 300, saveFailures: 1 })
  await page.goto(settingsUrl)
  const text = page.getByRole('checkbox', { name: '纯文本', exact: true })
  const close = page.getByRole('button', { name: '关闭设置', exact: true })
  await text.uncheck()
  await expect(page.locator('.settings-status')).toContainText('正在保存设置')
  await close.click()
  expect(await page.evaluate(() => window.inspection.calls.some((call) => call.command === 'plugin:window|destroy'))).toBe(false)
  await expect(page.locator('.settings-status')).toContainText('设置保存失败，请重试。')
  await expect(text).toBeChecked()
  expect(await page.evaluate(() => window.inspection.calls.some((call) => call.command === 'plugin:window|destroy'))).toBe(false)
  await text.uncheck()
  await close.click()
  await expect.poll(() => page.evaluate(() => window.inspection.calls.some((call) => call.command === 'plugin:window|destroy'))).toBe(true)
  expect(await page.evaluate(() => window.inspection.snapshot.settings.formats.text)).toBe(false)
})

for (const scenario of [
  { name: 'light', width: 480, height: 640, dark: false, forced: false },
  { name: 'dark-narrow', width: 400, height: 480, dark: true, forced: false },
  { name: 'wide', width: 960, height: 800, dark: false, forced: false },
  { name: 'high-contrast', width: 480, height: 640, dark: false, forced: true },
]) {
  test(`settings layout, focus and accessibility in ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height })
    await page.emulateMedia({ colorScheme: scenario.dark ? 'dark' : 'light', forcedColors: scenario.forced ? 'active' : 'none', reducedMotion: 'reduce' })
    await mockTauri(page)
    await page.goto(settingsUrl)
    await expect(page.getByRole('region', { name: '使用偏好' })).toBeVisible()
    await page.getByRole('button', { name: /^呼出快捷键/ }).focus()
    await checkAccessibility(page)
    await page.screenshot({ path: `.artifacts/settings-${scenario.name}-top.png` })
    await page.getByRole('spinbutton', { name: '最多保存条数' }).scrollIntoViewIfNeeded()
    // Radix also mounts visually hidden form-bridge inputs; measure the visible controls.
    expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.settings-panel, .settings-panel button, .settings-panel [data-slot="input"], .format-choice')].every((element) => {
      const box = element.getBoundingClientRect()
      return box.left >= 0 && box.right <= window.innerWidth
    }))).toBe(true)
    await page.locator('.settings-form').evaluate((form) => {
      const panel = form.querySelector<HTMLElement>('[aria-labelledby="recording-heading"]')!
      form.scrollTop += panel.getBoundingClientRect().top - form.getBoundingClientRect().top
    })
    await page.screenshot({ path: `.artifacts/settings-${scenario.name}-recording.png` })
    await page.getByRole('switch', { name: '恢复置顶内容', exact: true }).focus()
    await expect(page.getByRole('button', { name: '关闭设置', exact: true })).toBeInViewport()
    await expect(page.locator('.settings-status')).toBeInViewport()
    await checkAccessibility(page)
    await page.screenshot({ path: `.artifacts/settings-${scenario.name}-restore.png` })
  })
}
