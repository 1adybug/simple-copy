import type { Language } from '@simple-copy/i18n'

export type Kind = 'text' | 'link' | 'richText' | 'image' | 'files'
export type Retention = 'session' | 'pinned' | 'all'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  shortcut: string
  themeMode: ThemeMode
  language: Language
  formats: Record<Kind, boolean>
  retention: Retention
  maxHistoryItems: number
  expirySeconds: number
  restoreEnabled: boolean
  restoreSeconds: number
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
