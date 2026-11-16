import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

export async function checkAccessibility(page: Page, options: { popup?: boolean } = {}) {
  const builder = new AxeBuilder({ page })
  // Page landmark recommendations apply to the complete document. A modal listbox
  // intentionally exposes only its options; still check every WCAG A/AA rule.
  if (options.popup) builder.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
  const report = await builder.analyze()
  await test.info().attach('accessibility', { body: JSON.stringify(report), contentType: 'application/json' })
  expect(report.violations.map(({ id, nodes }) => ({
    id,
    issues: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
  }))).toEqual([])
}
