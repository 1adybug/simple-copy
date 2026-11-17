// Vite supplies the complete, content-versioned list of website resources.
const BUILD_VERSION = __BUILD_VERSION__
const base = new URL(self.registration.scope)
const prefix = `simple-copy-website:${base.pathname}:`
const shellCache = `${prefix}shell:${BUILD_VERSION}`
const metadataCache = `${prefix}installation`
const absoluteEntries = (entries) => new Map(entries.map((entry) => [new URL(entry.url, base).href, entry.type]))
const shell = absoluteEntries(__SHELL_ENTRIES__)
const metadata = absoluteEntries(__METADATA_ENTRIES__)

function validResponse(response, type) {
  return response.ok && !response.redirected && response.type !== 'opaque'
    && (response.headers.get('Content-Type') || '').includes(type)
}

async function cached(cacheName, url) {
  try {
    // A cleared or unavailable cache must not prevent an ordinary online visit.
    return await (await caches.open(cacheName)).match(url)
  } catch {
    return undefined
  }
}

async function installationResponse(request, type) {
  let response
  try {
    response = await fetch(request, { cache: 'no-cache' })
  } catch (error) {
    const previous = await cached(metadataCache, request.url)
    if (previous) return previous
    throw error
  }
  // Keep real HTTP errors and invalid responses visible; only a network failure
  // may fall back. A failed cache write must never discard a good network result.
  if (validResponse(response, type)) {
    try {
      await (await caches.open(metadataCache)).put(request.url, response.clone())
    } catch { /* Installation metadata still reaches the browser without storage. */ }
  }
  return response
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const resources = await Promise.all([...shell].map(async ([url, type]) => {
        const response = await fetch(new Request(url, { cache: 'reload', credentials: 'omit' }))
        if (!validResponse(response, type)) throw new Error(`Invalid PWA resource: ${url}`)
        return [url, response]
      }))
      const cache = await caches.open(shellCache)
      await Promise.all(resources.map(([url, response]) => cache.put(url, response)))
      // These stable URLs update independently from the versioned page shell.
      await Promise.all([...metadata].map(([url, type]) =>
        installationResponse(new Request(url, { credentials: 'omit' }), type).catch(() => undefined)))
    } catch (error) {
      // Never leave a partially installed shell for a later attempt to reuse.
      await caches.delete(shellCache).catch(() => false)
      throw error
    }
  })())
})

self.addEventListener('activate', (event) => {
  // No skipWaiting/clients.claim: existing windows finish their current visit.
  // When this activates naturally, no old worker-controlled windows remain.
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key.startsWith(`${prefix}shell:`) && key !== shellCache)
        .map((key) => caches.delete(key)))
    } catch { /* Online navigation remains available when storage is denied. */ }
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== base.origin || url.search || request.headers.has('Range')) return
  const metadataType = metadata.get(url.href)
  if (metadataType) {
    event.respondWith(installationResponse(request, metadataType))
    return
  }
  const key = request.mode === 'navigate' && url.href === base.href
    ? new URL('index.html', base).href : url.href
  if (!shell.has(key)) return
  event.respondWith((async () => (await cached(shellCache, key)) || fetch(request))())
})
