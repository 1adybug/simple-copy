import { expect, test as base, type Page } from '@playwright/test'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = fileURLToPath(new URL('../../', import.meta.url))
const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
type Site = { url: string; revision: number; manifestStatus: number; failNetwork: boolean }
const test = base.extend<{ site: Site; deployment: 'root' | 'subdirectory' }>({
  deployment: ['root', { option: true }],
  site: async ({ deployment }, use, testInfo) => {
    let dist = join(root, 'apps/website/dist')
    const path = deployment === 'subdirectory' ? '/copy/' : '/'
    if (deployment === 'subdirectory') {
      dist = testInfo.outputPath('site')
      const website = join(root, 'apps/website')
      const packagePath = createRequire(join(website, 'package.json')).resolve('vite/package.json')
      const { bin } = JSON.parse(await readFile(packagePath, 'utf8')) as { bin: { vite: string } }
      await promisify(execFile)(process.execPath, [join(dirname(packagePath), bin.vite),
        'build', '--base=/copy/', `--outDir=${dist}`, '--emptyOutDir'], {
        cwd: website, env: { ...process.env, VITE_SITE_URL: 'https://example.test' },
      })
    }
    const worker = await readFile(join(dist, 'sw.js'), 'utf8')
    const manifest = JSON.parse(await readFile(join(dist, 'manifest.webmanifest'), 'utf8'))
    const site: Site = { url: '', revision: 1, manifestStatus: 200, failNetwork: false }
    const server = createServer((request, response) => {
      if (site.failNetwork) { request.socket.destroy(); return }
      void (async () => {
        const url = new URL(request.url!, 'http://localhost')
        if (!url.pathname.startsWith(path)) { response.writeHead(404).end(); return }
        const file = decodeURIComponent(url.pathname.slice(path.length)) || 'index.html'
        if (file.split('/').includes('..')) { response.writeHead(404).end(); return }
        const body = file === 'sw.js' ? worker.replace(/const BUILD_VERSION = "[^"]+"/, `const BUILD_VERSION = "test-${site.revision}"`)
          : file === 'manifest.webmanifest' ? JSON.stringify({ ...manifest, description: `revision ${site.revision}` })
          : await readFile(join(dist, file))
        response.writeHead(file === 'manifest.webmanifest' ? site.manifestStatus : 200, {
          'Content-Type': types[extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-cache', 'X-PWA-Revision': String(site.revision),
        }).end(body)
      })().catch(() => response.writeHead(404).end('Not found'))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing test server address')
    site.url = `http://127.0.0.1:${address.port}${path}`
    try { await use(site) } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  },
})

async function controlled(page: Page, url: string) {
  await page.goto(url)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await expect(page.frameLocator('.demo-window').locator('.clip-card')).toHaveCount(5)
}

test('cached website and shared settings remain usable offline on a narrow viewport', async ({ page, context, site }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await controlled(page, site.url)
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href)).json())
  expect(manifest.name).toBe('Simple Copy')
  expect(manifest.id).toBe('/')
  expect(manifest.display).toBe('standalone')
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
  await context.setOffline(true)
  await page.reload()
  const demo = page.frameLocator('.demo-window')
  await expect(demo.locator('.clip-card')).toHaveCount(5)
  await demo.getByRole('button', { name: '设置', exact: true }).click()
  await demo.getByRole('combobox', { name: '明暗模式', exact: true }).click()
  await demo.getByRole('option', { name: '深色', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(demo.locator('html')).toHaveAttribute('data-theme', 'dark')
  await demo.getByRole('button', { name: '关闭设置', exact: true }).click()
  await expect(demo.locator('.clip-card')).toHaveCount(5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('offline-history.png'), fullPage: true })
})

test('old controlled pages refresh metadata and icons with correct offline, HTTP and quota failure behavior', async ({ page, context, site }) => {
  await controlled(page, site.url)
  const readMetadata = () => page.evaluate(async () => {
    const manifest = await fetch('manifest.webmanifest')
    const icon = await fetch('icons/pwa-512x512.png')
    return { description: (await manifest.json()).description, status: manifest.status, icon: icon.headers.get('X-PWA-Revision') }
  })
  site.revision = 2
  expect(await readMetadata()).toEqual({ description: 'revision 2', status: 200, icon: '2' })
  site.failNetwork = true
  expect(await readMetadata()).toEqual({ description: 'revision 2', status: 200, icon: '2' })
  site.failNetwork = false
  site.manifestStatus = 503
  expect((await readMetadata()).status).toBe(503)
  site.manifestStatus = 200
  await context.serviceWorkers()[0].evaluate(() => { Cache.prototype.put = async () => { throw new Error('Test quota exceeded') } })
  site.revision = 3
  expect(await readMetadata()).toEqual({ description: 'revision 3', status: 200, icon: '3' })
  site.failNetwork = true
  expect(await readMetadata()).toEqual({ description: 'revision 2', status: 200, icon: '2' })
  site.failNetwork = false
  expect(await page.evaluate(async () => (await fetch('downloads/missing.exe')).status)).toBe(404)
  expect(await page.evaluate(async () => (await fetch('api/write', { method: 'POST', body: 'sample' })).status)).toBe(404)
})

test('an update waits for all old windows without replacing their demo state', async ({ page, context, site }) => {
  await controlled(page, site.url)
  const second = await context.newPage()
  await second.goto(site.url)
  const search = page.frameLocator('.demo-window').getByRole('searchbox', { name: '搜索剪贴板' })
  await search.fill('链接')
  site.revision = 2
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update() })
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true)
  await expect(search).toHaveValue('链接')
  await expect(page.frameLocator('.demo-window').locator('.clip-card')).toHaveCount(1)
  await second.close()
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true)
  await page.close()
  const reopened = await context.newPage()
  await controlled(reopened, site.url)
  await expect.poll(() => reopened.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(false)
  const keys = await reopened.evaluate(() => caches.keys())
  expect(keys.filter((key) => key.includes(':shell:'))).toEqual(['simple-copy-website:/:shell:test-2'])
})

test('registration failure and unsupported workers preserve the ordinary website', async ({ page, site }) => {
  const warnings: string[] = []
  page.on('console', (message) => { if (message.type() === 'warning') warnings.push(message.text()) })
  await page.addInitScript(() => {
    navigator.serviceWorker.register = async () => { throw new Error('Test registration denied') }
  })
  await page.goto(site.url)
  await expect(page.frameLocator('.demo-window').locator('.clip-card')).toHaveCount(5)
  await expect.poll(() => warnings.some((message) => message.includes('offline support could not start'))).toBe(true)
  const unsupported = await page.context().newPage()
  await unsupported.addInitScript(() => { Reflect.deleteProperty(Navigator.prototype, 'serviceWorker') })
  await unsupported.goto(site.url)
  await expect(unsupported.frameLocator('.demo-window').locator('.clip-card')).toHaveCount(5)
})

test('cleared storage and denied cache access preserve an ordinary online visit', async ({ page, context, site }) => {
  await controlled(page, site.url)
  await context.serviceWorkers()[0].evaluate(async () => {
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)))
    CacheStorage.prototype.open = async () => { throw new Error('Test storage denied') }
  })
  site.revision = 2
  await page.reload()
  await expect(page.frameLocator('.demo-window').locator('.clip-card')).toHaveCount(5)
  expect(await page.evaluate(async () => (await (await fetch('manifest.webmanifest')).json()).description)).toBe('revision 2')
})

test('production preview returns real PWA resources and genuine missing-resource responses', async ({ request }) => {
  const url = 'http://127.0.0.1:4174'
  const manifest = await request.get(url + '/manifest.webmanifest')
  expect(manifest.status()).toBe(200)
  expect(manifest.headers()['content-type']).toContain('application/manifest+json')
  const worker = await request.get(url + '/sw.js')
  expect(worker.status()).toBe(200)
  expect(worker.headers()['content-type']).toContain('javascript')
  for (const path of ['/missing-worker.js', '/icons/missing.png', '/downloads/missing.exe', '/api/missing']) {
    expect((await request.get(url + path)).status()).toBe(404)
  }
})

test.describe('subdirectory deployment', () => {
  test.use({ deployment: 'subdirectory' })
  test('identity, canonical, scope, iframe and offline navigation respect the build base', async ({ page, context, site }) => {
    await controlled(page, site.url)
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/copy/manifest.webmanifest')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://example.test/copy/')
    const protocol = await context.newCDPSession(page)
    const parsed = await protocol.send('Page.getAppManifest')
    expect(parsed.errors).toEqual([])
    expect(parsed.manifest.id).toBe(site.url)
    expect(parsed.manifest.startUrl).toBe(site.url)
    expect(parsed.manifest.scope).toBe(site.url)
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope)).toBe(site.url)
    await context.setOffline(true)
    await page.goto(site.url + 'demo.html')
    await expect(page.locator('.clip-card')).toHaveCount(5)
    await page.goBack()
    await expect(page.frameLocator('.demo-window').locator('.clip-card')).toHaveCount(5)
  })
})
