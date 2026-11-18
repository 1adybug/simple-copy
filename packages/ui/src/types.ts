import type { Language } from '@simple-copy/i18n'

export type Kind = 'text' | 'link' | 'richText' | 'image' | 'files'
export type Retention = 'session' | 'pinned' | 'all'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  shortcut: string
  themeMode: ThemeMode
  language: Language
  launchOnStartup: boolean
  formats: Record<Kind, boolean>
  retention: Retention
  maxHistoryItems: number
  expirySeconds: number
  restoreEnabled: boolean
  restoreSeconds: number
  autoUpdate: boolean
}

export type UpdateStatus = 'unavailable' | 'idle' | 'checking' | 'upToDate' | 'available'
  | 'downloading' | 'installing' | 'checkFailed' | 'downloadFailed' | 'installFailed'

export interface UpdateSnapshot {
  revision: number
  currentVersion: string
  status: UpdateStatus
  version: string | null
  downloaded: number
  total: number | null
}

export interface UpdateController {
  snapshot: UpdateSnapshot | null
  busy: boolean
  error: 'connectionFailed' | null
  check: () => Promise<void>
  install: () => Promise<void>
}

export type SettingsPatch = Partial<Omit<Settings, 'formats'>> & { formats?: Partial<Settings['formats']> }

export interface Clip {
  id: number
  kind: Kind
  pinned: boolean
  text: string
  hasThumbnail: boolean
  fileCount: number
}

export type HistoryAction =
  | { type: 'copy' | 'paste' | 'delete'; id: number }
  | { type: 'pin'; id: number; pinned: boolean }
  | { type: 'clearUnpinned' }
