import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ResolvedConfig } from 'vite'

const manifestPath = fileURLToPath(new URL('./manifest.json', import.meta.url))
const workerPath = fileURLToPath(new URL('./service-worker.js', import.meta.url))
const appleIcon = 'icons/apple-touch-icon.png'
const contentTypes: Record<string, string> = {
  '.html': 'text/html', '.js': 'javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
}

export function websitePwa(siteUrl = ''): Plugin {
  let config: ResolvedConfig
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name: string; description: string; theme_color: string; icons: { src: string; type: string }[]
  }
  const renderedManifest = () => JSON.stringify({ ...manifest, id: config.base }, null, 2) + '\n'
  return {
    name: 'simple-copy-website-pwa',
    configResolved(resolved) {
      config = resolved
      if (!config.base.startsWith('/') || config.base.startsWith('//')) {
        throw new Error('The website PWA base must be a fixed same-origin path, such as / or /copy/.')
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!['GET', 'HEAD'].includes(request.method || '')
          || new URL(request.url || '/', 'http://pwa.local').pathname !== `${config.base}manifest.webmanifest`) return next()
        response.setHeader('Content-Type', 'application/manifest+json')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(request.method === 'HEAD' ? undefined : renderedManifest())
      })
    },
    buildStart() {
      this.addWatchFile(manifestPath)
      this.addWatchFile(workerPath)
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        return [
          ...(siteUrl ? [
            { tag: 'link', attrs: { rel: 'canonical', href: new URL(config.base, siteUrl).href }, injectTo: 'head' as const },
            { tag: 'meta', attrs: { property: 'og:url', content: new URL(config.base, siteUrl).href }, injectTo: 'head' as const },
          ] : []),
          { tag: 'link', attrs: { rel: 'manifest', href: `${config.base}manifest.webmanifest` }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: `${config.base}${appleIcon}` }, injectTo: 'head' },
          ...Object.entries({
            'mobile-web-app-capable': 'yes',
            'apple-mobile-web-app-capable': 'yes',
            'apple-mobile-web-app-title': manifest.name,
            'apple-mobile-web-app-status-bar-style': 'default',
            'theme-color': manifest.theme_color,
            ...(context.filename.endsWith('index.html') ? { description: manifest.description } : {}),
          }).map(([name, content]) => ({ tag: 'meta', attrs: { name, content }, injectTo: 'head' as const })),
        ]
      },
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        // Manifest id resolves against the start URL's origin, not its directory.
        // Emit the deployment path explicitly so /copy/ does not acquire id /.
        this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: renderedManifest() })
        const shell = Object.values(bundle)
          .filter((entry) => contentTypes[extname(entry.fileName)])
          .sort((a, b) => a.fileName.localeCompare(b.fileName))
        for (const page of ['index.html', 'demo.html']) {
          if (!shell.some((entry) => entry.fileName === page)) this.error(`Missing PWA entry: ${page}`)
        }
        const metadata = [
          { url: 'manifest.webmanifest', type: 'json' },
          ...manifest.icons.map((icon) => ({ url: icon.src, type: icon.type })),
          { url: appleIcon, type: 'image/png' },
        ]
        const source = readFileSync(workerPath, 'utf8')
        const hash = createHash('sha256').update(source)
        for (const entry of shell) {
          hash.update(entry.fileName).update(entry.type === 'chunk' ? entry.code : entry.source)
        }
        for (const entry of metadata) {
          hash.update(entry.url).update(entry.url === 'manifest.webmanifest'
            ? renderedManifest() : readFileSync(resolve(config.publicDir, entry.url)))
        }
        this.emitFile({
          type: 'asset', fileName: 'sw.js',
          source: source
            .replace('__BUILD_VERSION__', JSON.stringify(hash.digest('hex').slice(0, 20)))
            .replace('__SHELL_ENTRIES__', JSON.stringify(shell.map((entry) => ({ url: entry.fileName, type: contentTypes[extname(entry.fileName)] }))))
            .replace('__METADATA_ENTRIES__', JSON.stringify(metadata)),
        })
      },
    },
  }
}
