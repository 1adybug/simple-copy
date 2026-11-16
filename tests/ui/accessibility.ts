import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

export async function checkAccessibility(page: Page) {
  const report = await new AxeBuilder({ page }).analyze()
  await test.info().attach('accessibility', { body: JSON.stringify(report), contentType: 'application/json' })
  expect(report.violations.map(({ id, nodes }) => ({
    id,
    issues: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
  }))).toEqual([])
}
