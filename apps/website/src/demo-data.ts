import type { Clip } from '@simple-copy/ui/types'
import { getLocale, translate, type Locale } from '@simple-copy/i18n'

export const createDemoClips = (locale: Locale = getLocale()): Clip[] => [
  { id: 1, kind: 'text', text: translate(locale, 'site.sampleIdea'), pinned: true, hasThumbnail: false, fileCount: 0 },
  { id: 2, kind: 'richText', text: translate(locale, 'site.sampleNote'), pinned: false, hasThumbnail: false, fileCount: 0 },
  { id: 3, kind: 'link', text: 'https://example.com/a-little-inspiration', pinned: false, hasThumbnail: false, fileCount: 0 },
  { id: 4, kind: 'image', text: translate(locale, 'imagePreview'), pinned: false, hasThumbnail: true, fileCount: 0 },
  { id: 5, kind: 'files', text: 'Notes.txt\nProposal.pdf', pinned: false, hasThumbnail: false, fileCount: 2 },
]

export const demoViewMessage = 'simple-copy:demo-view'
