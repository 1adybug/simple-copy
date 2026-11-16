import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: 'list',
  outputDir: '.artifacts/ui-tests',
  use: {
    browserName: 'chromium',
    locale: 'zh-CN',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @simple-copy/desktop exec vite preview --host 127.0.0.1 --port 1421 --strictPort',
      url: 'http://127.0.0.1:1421',
    },
    {
      command: 'pnpm --filter @simple-copy/website preview --port 4174',
      url: 'http://127.0.0.1:4174',
    },
  ],
})
