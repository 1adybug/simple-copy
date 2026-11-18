import type { Page } from '@playwright/test'
import type { PopupPresentation, Snapshot } from '../../apps/desktop/src/native'
import type { SystemAppearance } from '../../apps/desktop/src/theme'
import type { Locale } from '../../packages/i18n/src/index'
import type { UpdateSnapshot } from '../../packages/ui/src/types'

interface MockOptions {
  systemLocale?: Locale
  systemLocaleFailure?: boolean
  items?: Snapshot['items']
  imageCount?: number
  thumbnailFailure?: boolean
  thumbnailDelay?: number
  snapshotDelay?: number
  settings?: Partial<Snapshot['settings']>
  capabilities?: Partial<Snapshot['capabilities']>
  saveDelay?: number
  saveFailures?: number
  appearance?: Partial<SystemAppearance>
  appearanceDelay?: number
  appearanceFailure?: boolean
  updates?: Partial<UpdateSnapshot>
  updateSnapshotDelay?: number
  updateSnapshotFailure?: boolean
  updateDelay?: number
  updateFailures?: number
  updateVersion?: string | null
  installFailure?: 'downloadFailed' | 'installFailed'
}

export async function mockTauri(page: Page, options: MockOptions = {}) {
  await page.addInitScript((options: MockOptions) => {
    const appearance: SystemAppearance = { revision: 1, accentColor: null, transparency: false, nativeCorners: false, ...options.appearance }
    const systemLocale = options.systemLocaleFailure ? 'en' : options.systemLocale ?? 'zh-CN'
    const snapshot: Snapshot = {
      locale: options.settings?.language && options.settings.language !== 'system' ? options.settings.language : systemLocale,
      revision: 1,
      popup: { token: 1, mode: 'active' },
      items: options.items ?? Array.from({ length: options.imageCount ?? 1 }, (_, index) => ({
        id: index + 1,
        kind: options.imageCount ? 'image' : 'text',
        pinned: index === 0,
        text: `示例内容 ${index + 1}`,
        hasThumbnail: !!options.imageCount,
        fileCount: 0,
      })),
      settings: {
        shortcut: 'Super+V', themeMode: 'system', language: 'system', launchOnStartup: true,
        formats: { text: true, link: true, richText: true, image: true, files: true },
        retention: 'pinned', maxHistoryItems: 20, expirySeconds: 86400,
        restoreEnabled: false, restoreSeconds: 5, autoUpdate: true,
        ...options.settings,
      },
      capabilities: {
        platform: 'windows', background: true, automaticPaste: true,
        restoreAvailable: true, canAuthorize: false, message: null,
        ...options.capabilities,
      },
      storageStatus: null, shortcutError: null, startupAvailable: true, startupError: null, error: null, restorePending: false,
    }
    const updates: UpdateSnapshot = {
      revision: 1, currentVersion: '0.1.0', status: 'idle', version: null, downloaded: 0, total: null,
      ...options.updates,
    }
    let updateFailures = options.updateFailures ?? 0
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
      snapshot, appearance, updates, calls, activeUrls, pendingThumbnails: 0, pendingAppearance: 0,
      emit,
      publish: () => {
        snapshot.locale = snapshot.settings.language === 'system' ? systemLocale : snapshot.settings.language
        snapshot.revision++
        emit('clipboard-state', structuredClone(snapshot))
      },
      publishAppearance: () => { appearance.revision++; emit('system-appearance-changed', structuredClone(appearance)) },
      publishUpdates: () => { updates.revision++; emit('update-state', structuredClone(updates)) },
      reopen: (mode: PopupPresentation['mode'] = 'active') => {
        snapshot.popup = { token: snapshot.popup.token + 1, mode }
        emit('popup-state', snapshot.popup)
      },
    }
    let saveFailures = options.saveFailures ?? 0
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
          if (command === 'update_snapshot') {
            const initial = structuredClone(updates)
            if (options.updateSnapshotDelay) await new Promise((resolve) => setTimeout(resolve, options.updateSnapshotDelay))
            if (options.updateSnapshotFailure) throw new Error('Update status unavailable')
            return initial
          }
          if (command === 'check_for_updates') {
            updates.status = 'checking'
            updates.version = null
            inspection.publishUpdates()
            if (options.updateDelay) await new Promise((resolve) => setTimeout(resolve, options.updateDelay))
            if (updateFailures > 0) { updateFailures--; updates.status = 'checkFailed' }
            else {
              updates.version = options.updateVersion === undefined ? '0.2.0' : options.updateVersion
              updates.status = updates.version ? 'available' : 'upToDate'
            }
            inspection.publishUpdates()
            return structuredClone(updates)
          }
          if (command === 'install_update') {
            updates.status = 'downloading'
            updates.downloaded = 1024
            updates.total = 2048
            inspection.publishUpdates()
            if (options.updateDelay) await new Promise((resolve) => setTimeout(resolve, options.updateDelay))
            updates.status = options.installFailure ?? 'installing'
            inspection.publishUpdates()
            return structuredClone(updates)
          }
          if (command === 'system_locale') {
            if (options.systemLocaleFailure) throw new Error('System locale unavailable')
            return snapshot.locale
          }
          if (command === 'system_appearance') {
            inspection.pendingAppearance++
            const result = structuredClone(appearance)
            try {
              if (options.appearanceDelay) await new Promise((resolve) => setTimeout(resolve, options.appearanceDelay))
              if (options.appearanceFailure) throw new Error('System appearance unavailable')
              return result
            } finally { inspection.pendingAppearance-- }
          }
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
          if (command === 'plugin:window|close') { emit('tauri://close-requested', null); return }
          if (command === 'save_settings') {
            if (options.saveDelay) await new Promise((resolve) => setTimeout(resolve, options.saveDelay))
            if (saveFailures > 0) { saveFailures--; throw new Error('设置保存失败，请重试。') }
            snapshot.settings = structuredClone(args.settings as Snapshot['settings'])
            inspection.publish()
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
      appearance: SystemAppearance
      updates: UpdateSnapshot
      calls: { command: string; args: Record<string, unknown> }[]
      activeUrls: Set<string>
      pendingThumbnails: number
      pendingAppearance: number
      emit: (event: string, payload: unknown) => void
      publish: () => void
      publishAppearance: () => void
      publishUpdates: () => void
      reopen: (mode?: PopupPresentation['mode']) => void
    }
  }
}
