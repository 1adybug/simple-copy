import type { Clip } from '@simple-copy/ui/types'
import { getLocale, translate, type Locale } from '@simple-copy/i18n'

export const createDemoClips = (locale: Locale = getLocale()): Clip[] => [
  { id: 1, kind: 'text', text: translate(locale, 'site.sampleIdea'), pinned: true, hasThumbnail: false, fileCount: 0 },
  { id: 2, kind: 'text', text: translate(locale, 'site.sampleNote'), pinned: false, hasThumbnail: false, fileCount: 0 },
  { id: 3, kind: 'link', text: 'https://example.com/a-little-inspiration', pinned: false, hasThumbnail: false, fileCount: 0 },
]

export const demoPasteMessage = 'simple-copy:demo-paste'
