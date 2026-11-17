import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const template = await readFile(new URL('../../apps/website/service-worker.js', import.meta.url), 'utf8')
const shell = [
  { url: 'index.html', type: 'text/html' }, { url: 'demo.html', type: 'text/html' },
  { url: 'assets/app.js', type: 'javascript' }, { url: 'assets/font.woff2', type: 'font/woff2' },
]
const metadata = [
  { url: 'manifest.webmanifest', type: 'json' }, { url: 'icons/app.png', type: 'image/png' },
]
const scope = 'https://example.test/copy/'
const prefix = 'simple-copy-website:/copy/:'

function worker() {
  const stores = new Map()
  const network = new Map([...shell, ...metadata].map(({ url, type }) => [new URL(url, scope).href, { body: url, type }]))
  const calls = []
  const events = new Map()
  const state = { offline: false, denied: false, rejectWrites: false, skipWaiting: false, claimed: false }
  const caches = {
    async open(name) {
      if (state.denied) throw new Error('Storage unavailable')
      if (!stores.has(name)) stores.set(name, new Map())
      const store = stores.get(name)
      return {
        async match(key) { return store.get(String(key))?.clone() },
        async put(key, response) {
          if (state.rejectWrites) throw new Error('Quota exceeded')
          store.set(String(key), response.clone())
        },
      }
    },
    async keys() { if (state.denied) throw new Error('Storage unavailable'); return [...stores.keys()] },
    async delete(name) { return stores.delete(name) },
  }
  async function fetch(input, init) {
    const request = new Request(input, init)
    calls.push(request)
    if (state.offline) throw new TypeError('Network unavailable')
    const result = network.get(request.url)
    const response = new Response(result?.body ?? 'Not found', {
      status: result?.status ?? (result ? 200 : 404), headers: { 'Content-Type': result?.type ?? 'text/plain' },
    })
    if (result?.redirected) Object.defineProperty(response, 'redirected', { value: true })
    return response
  }
  runInNewContext(template
    .replace('__BUILD_VERSION__', '"current"')
    .replace('__SHELL_ENTRIES__', JSON.stringify(shell))
    .replace('__METADATA_ENTRIES__', JSON.stringify(metadata)), {
    URL, Request, caches, fetch,
    self: {
      registration: { scope },
      addEventListener: (name, callback) => events.set(name, callback),
      skipWaiting: () => { state.skipWaiting = true },
      clients: { claim: () => { state.claimed = true } },
    },
  })
  return {
    stores, network, state, calls,
    async lifecycle(name) {
      let pending
      events.get(name)({ waitUntil: (promise) => { pending = promise } })
      await pending
    },
    request(path, init, navigate = false) {
      const request = new Request(new URL(path, scope), init)
      if (navigate) Object.defineProperty(request, 'mode', { value: 'navigate' })
      let response
      events.get('fetch')({ request, respondWith: (promise) => { response = promise } })
      return response
    },
    set(path, result) { network.set(new URL(path, scope).href, result) },
  }
}

test('a complete shell supports the landing page, iframe, scripts and fonts offline', async () => {
  const app = worker()
  await app.lifecycle('install')
  app.state.offline = true
  for (const path of ['', 'index.html', 'demo.html', 'assets/app.js', 'assets/font.woff2']) {
    assert.equal(await (await app.request(path, undefined, true)).text(), path || 'index.html')
  }
  assert.equal(await (await app.request('manifest.webmanifest')).text(), 'manifest.webmanifest')
  assert.equal(app.state.skipWaiting, false)
  assert.equal(app.state.claimed, false)
})

test('an old shell reads new installation metadata and icons, revalidating the HTTP cache', async () => {
  const app = worker()
  await app.lifecycle('install')
  for (const [path, type] of [['manifest.webmanifest', 'application/manifest+json'], ['icons/app.png', 'image/png']]) {
    app.set(path, { body: 'new metadata', type })
    assert.equal(await (await app.request(path)).text(), 'new metadata')
    assert.equal(app.calls.at(-1).cache, 'no-cache')
    app.state.offline = true
    assert.equal(await (await app.request(path)).text(), 'new metadata')
    app.state.offline = false
  }
  app.set('index.html', { body: 'new shell', type: 'text/html' })
  assert.equal(await (await app.request('index.html')).text(), 'index.html')
})

test('failed metadata cache writes preserve a valid network response and the previous offline fallback', async () => {
  const app = worker()
  await app.lifecycle('install')
  app.state.rejectWrites = true
  app.set('manifest.webmanifest', { body: 'new manifest', type: 'application/manifest+json' })
  assert.equal(await (await app.request('manifest.webmanifest')).text(), 'new manifest')
  app.state.offline = true
  assert.equal(await (await app.request('manifest.webmanifest')).text(), 'manifest.webmanifest')
})

test('real HTTP errors, redirects and HTML fallback never replace installation metadata', async () => {
  const app = worker()
  await app.lifecycle('install')
  for (const result of [
    { status: 404, type: 'application/json' }, { status: 503, type: 'text/html' },
    { type: 'text/html' }, { type: 'application/json', redirected: true },
  ]) {
    app.set('manifest.webmanifest', { body: 'server response', ...result })
    const response = await app.request('manifest.webmanifest')
    assert.equal(response.status, result.status ?? 200)
    assert.equal(await response.text(), 'server response')
    app.state.offline = true
    assert.equal(await (await app.request('manifest.webmanifest')).text(), 'manifest.webmanifest')
    app.state.offline = false
  }
})

test('denied or cleared storage keeps online responses usable and does not invent offline success', async () => {
  const app = worker()
  app.state.denied = true
  assert.equal(await (await app.request('manifest.webmanifest')).text(), 'manifest.webmanifest')
  assert.equal(await (await app.request('index.html')).text(), 'index.html')
  app.state.offline = true
  await assert.rejects(app.request('manifest.webmanifest'), /Network unavailable/)
  await assert.rejects(app.request('index.html'), /Network unavailable/)
  await app.lifecycle('activate')
  const cleared = worker()
  await cleared.lifecycle('install')
  cleared.stores.clear()
  assert.equal(await (await cleared.request('index.html')).text(), 'index.html')
  cleared.state.offline = true
  await assert.rejects(cleared.request('index.html'), /Network unavailable/)
})

test('an incomplete or quota-failed installation cannot publish a partial shell', async () => {
  for (const quota of [false, true]) {
    const app = worker()
    app.stores.set(`${prefix}shell:older`, new Map())
    if (quota) app.state.rejectWrites = true
    else app.set('assets/app.js', { body: 'SPA fallback', type: 'text/html' })
    await assert.rejects(app.lifecycle('install'))
    assert.deepEqual([...app.stores.keys()], [`${prefix}shell:older`])
  }
})

test('activation removes only old shell caches owned by this deployment scope', async () => {
  const app = worker()
  await app.lifecycle('install')
  const preserved = [...app.stores.keys()]
  for (const key of [`${prefix}shell:older`, 'other-app', 'simple-copy-website:/other/:shell:older']) app.stores.set(key, new Map())
  await app.lifecycle('activate')
  assert.deepEqual([...app.stores.keys()], [...preserved, 'other-app', 'simple-copy-website:/other/:shell:older'])
})

test('downloads, APIs, unknown paths, mutations, range and token URLs keep normal network semantics', () => {
  const app = worker()
  for (const [url, init] of [
    ['downloads/installer.exe'], ['api/history'], ['unknown.html'], ['/outside/'], ['https://other.test/index.html'],
    ['index.html?token=private'], ['manifest.webmanifest?token=private'],
    ['index.html', { method: 'POST', body: 'write' }], ['assets/app.js', { headers: { Range: 'bytes=0-9' } }],
  ]) assert.equal(app.request(url, init), undefined)
})
