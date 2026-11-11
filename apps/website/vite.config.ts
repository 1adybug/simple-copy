import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const { VITE_DOWNLOAD_URL = '', VITE_SITE_URL = '' } = loadEnv(mode, process.cwd(), 'VITE_')
  const isLocalDownload = VITE_DOWNLOAD_URL.startsWith('/')
    && !VITE_DOWNLOAD_URL.startsWith('//') && !/[\\\s]/.test(VITE_DOWNLOAD_URL)
  const isHttpsDownload = URL.canParse(VITE_DOWNLOAD_URL)
    && new URL(VITE_DOWNLOAD_URL).protocol === 'https:'
  if (VITE_DOWNLOAD_URL && !isLocalDownload && !isHttpsDownload) {
    throw new Error('VITE_DOWNLOAD_URL must be an HTTPS URL or a root-relative file path.')
  }
  if (VITE_SITE_URL && new URL(VITE_SITE_URL).protocol !== 'https:') {
    throw new Error('VITE_SITE_URL must be an HTTPS URL.')
  }
  return {
    plugins: [
      react(),
      {
        name: 'simple-copy-site-metadata',
        transformIndexHtml() {
          if (!VITE_SITE_URL) return []
          const url = new URL('/', VITE_SITE_URL).href
          return [
            { tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' },
            { tag: 'meta', attrs: { property: 'og:url', content: url }, injectTo: 'head' },
          ]
        },
      },
    ],
    server: { port: 5173 },
    preview: { port: 4173 },
    build: { target: ['chrome111', 'safari16.4'] },
  }
})
