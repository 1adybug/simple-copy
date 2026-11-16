import type { Page } from '@playwright/test'
import type { Snapshot } from '../../apps/desktop/src/native'

interface MockOptions {
  imageCount?: number
  thumbnailFailure?: boolean
  thumbnailDelay?: number
  snapshotDelay?: number
}

export async function mockTauri(page: Page, options: MockOptions = {}) {
  await page.addInitScript((options: MockOptions) => {
    const snapshot: Snapshot = {
      revision: 1,
      popupToken: 1,
      items: Array.from({ length: options.imageCount ?? 1 }, (_, index) => ({
        id: index + 1,
        kind: options.imageCount ? 'image' : 'text',
        pinned: index === 0,
        text: `示例内容 ${index + 1}`,
        hasThumbnail: !!options.imageCount,
        fileCount: 0,
      })),
      settings: {
        shortcut: 'Super+V', themeMode: 'system',
        formats: { text: true, link: true, richText: true, image: true, files: true },
        retention: 'pinned', maxHistoryItems: 100,
        restoreEnabled: false, restoreSeconds: 5,
      },
      capabilities: {
        platform: 'windows', background: true, automaticPaste: true,
        restoreAvailable: true, canAuthorize: false, message: null,
      },
      storageStatus: null, shortcutError: null, error: null, restorePending: false,
    }
    let nextId = 0
    const callbacks = new Map<number, (event: unknown) => void>()
    const listeners = new Map<number, { event: string; handler: number }>()
    const calls: { command: string; args: Record<string, unknown> }[] = []
    const activeUrls = new Set<string>()
    const createObjectURL = URL.createObjectURL.bind(URL)
    const revokeObjectURL = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = createObjectURL(blob)
      activeUrls.add(url)
      return url
    }
    URL.revokeObjectURL = (url) => { activeUrls.delete(url); revokeObjectURL(url) }

    const emit = (event: string, payload: unknown) => {
      for (const [id, listener] of listeners) {
        if (listener.event === event) callbacks.get(listener.handler)?.({ event, id, payload })
      }
    }
    const inspection = {
      snapshot, calls, activeUrls, pendingThumbnails: 0,
      publish: () => { snapshot.revision++; emit('clipboard-state', structuredClone(snapshot)) },
    }
    Object.assign(window, {
      inspection,
      isTauri: true,
      __TAURI_EVENT_PLUGIN_INTERNALS__: {
        unregisterListener: (_event: string, id: number) => { listeners.delete(id) },
      },
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'test' }, currentWebview: { label: 'test' } },
        transformCallback: (callback: (event: unknown) => void) => { callbacks.set(++nextId, callback); return nextId },
        unregisterCallback: (id: number) => { callbacks.delete(id) },
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          if (command === 'plugin:event|listen') {
            listeners.set(++nextId, args as { event: string; handler: number })
            return nextId
          }
          if (command === 'plugin:event|unlisten') { listeners.delete(args.eventId as number); return }
          calls.push({ command, args })
          if (command === 'clipboard_snapshot') {
            if (options.snapshotDelay) await new Promise((resolve) => setTimeout(resolve, options.snapshotDelay))
            return structuredClone(snapshot)
          }
          if (command === 'clipboard_thumbnail') {
            inspection.pendingThumbnails++
            try {
              if (options.thumbnailDelay) await new Promise((resolve) => setTimeout(resolve, options.thumbnailDelay))
              if (options.thumbnailFailure) throw new Error('Preview unavailable')
              // A real, decodable PNG; no system clipboard or native window is used.
              return Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0)).buffer
            } finally { inspection.pendingThumbnails-- }
          }
          if (command === 'plugin:window|is_maximized') return false
          if (command === 'save_settings') {
            snapshot.settings = structuredClone(args.settings as Snapshot['settings'])
            snapshot.revision++
            emit('clipboard-state', structuredClone(snapshot))
            return structuredClone(snapshot)
          }
          if (command === 'history_action' || command === 'capture_current') return { message: '操作已完成' }
          return null
        },
      },
    })
  }, options)
}

declare global {
  interface Window {
    inspection: {
      snapshot: Snapshot
      calls: { command: string; args: Record<string, unknown> }[]
      activeUrls: Set<string>
      pendingThumbnails: number
      publish: () => void
    }
  }
}
