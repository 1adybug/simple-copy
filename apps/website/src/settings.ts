import { resolveLocale, setLocale, supportedLocales, type Locale } from '@simple-copy/i18n'
import type { Settings, SettingsPatch } from '@simple-copy/ui/types'
import { useSyncExternalStore } from 'react'

const storageKey = 'simple-copy:website-settings'
const settingsMessage = 'simple-copy:website-settings'
const defaults: Settings = {
  shortcut: 'Super+V', themeMode: 'system', language: 'system',
  formats: { text: true, link: true, richText: true, image: true, files: true },
  retention: 'pinned', maxHistoryItems: 20, expirySeconds: 86400,
  restoreEnabled: false, restoreSeconds: 5, autoUpdate: false,
}

function validSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false
  const settings = value as Settings
  return typeof settings.shortcut === 'string'
    && ['system', 'light', 'dark'].includes(settings.themeMode)
    && (settings.language === 'system' || supportedLocales.includes(settings.language))
    && ['session', 'pinned', 'all'].includes(settings.retention)
    && !!settings.formats && Object.keys(defaults.formats).every((kind) => typeof settings.formats[kind as keyof Settings['formats']] === 'boolean')
    && Number.isInteger(settings.maxHistoryItems) && settings.maxHistoryItems >= 0 && settings.maxHistoryItems <= 4294967295
    && Number.isInteger(settings.expirySeconds) && settings.expirySeconds >= 1 && settings.expirySeconds <= 4294967295
    && Number.isInteger(settings.restoreSeconds) && settings.restoreSeconds >= 1 && settings.restoreSeconds <= 3600
    && typeof settings.restoreEnabled === 'boolean' && typeof settings.autoUpdate === 'boolean'
}

function readSettings(): Settings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (validSettings(stored)) return stored
  } catch { /* Blocked or invalid browser storage keeps the default settings usable. */ }
  return defaults
}

let settings = readSettings()
const listeners = new Set<() => void>()
const embedded = window.parent !== window
// The host media query reflects the OS, independently of the iframe's color-scheme.
const host = (() => {
  try { if (embedded && window.parent.location.origin === location.origin) return window.parent } catch { /* A cross-origin embed uses its own browser preferences. */ }
  return window
})()
const systemTheme = host.matchMedia('(prefers-color-scheme: dark)')

export function syncDemoSettings() {
  document.querySelector<HTMLIFrameElement>('.demo-window')?.contentWindow?.postMessage({
    type: settingsMessage, settings, locale: document.documentElement.lang,
    theme: document.documentElement.dataset.theme,
  }, location.origin)
}

function applySettings(appearance?: { locale: Locale; theme: 'light' | 'dark' }) {
  const locale = appearance?.locale ?? (settings.language === 'system' ? resolveLocale(host.navigator.languages) : settings.language)
  const theme = appearance?.theme ?? (settings.themeMode === 'system' ? systemTheme.matches ? 'dark' : 'light' : settings.themeMode)
  setLocale(locale)
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1d1721' : '#fdfcfe')
  for (const listener of listeners) listener()
  if (!embedded) syncDemoSettings()
}

export async function saveWebsiteSettings(patch: SettingsPatch): Promise<boolean> {
  settings = { ...settings, ...patch, formats: { ...settings.formats, ...patch.formats } }
  try { localStorage.setItem(storageKey, JSON.stringify(settings)) } catch { /* Settings still apply for this page visit. */ }
  applySettings()
  if (embedded) window.parent.postMessage({ type: settingsMessage, settings }, location.origin)
  return true
}

window.addEventListener('storage', (event) => {
  if (event.key !== storageKey && event.key !== null) return
  settings = readSettings()
  applySettings()
})
window.addEventListener('message', (event: MessageEvent) => {
  const source = embedded ? window.parent : document.querySelector<HTMLIFrameElement>('.demo-window')?.contentWindow
  if (event.origin !== location.origin || event.source !== source
    || event.data?.type !== settingsMessage || !validSettings(event.data.settings)) return
  settings = event.data.settings
  const appearance = embedded && supportedLocales.includes(event.data.locale) && ['light', 'dark'].includes(event.data.theme)
    ? { locale: event.data.locale as Locale, theme: event.data.theme as 'light' | 'dark' } : undefined
  applySettings(appearance)
})
window.addEventListener('languagechange', () => applySettings())
systemTheme.addEventListener('change', () => applySettings())
applySettings()

export function useWebsiteSettings() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, () => settings)
}
