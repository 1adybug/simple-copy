import type { Clip } from '@simple-copy/ui/types'

export const demoClips: Clip[] = [
  { id: 1, kind: 'text', text: '留一点空间，给下一个好想法。', pinned: true, hasThumbnail: false, fileCount: 0 },
  { id: 2, kind: 'text', text: '周五下午三点，带上新提案见面。', pinned: false, hasThumbnail: false, fileCount: 0 },
  { id: 3, kind: 'link', text: 'https://example.com/a-little-inspiration', pinned: false, hasThumbnail: false, fileCount: 0 },
]

export const demoPasteMessage = 'simple-copy:demo-paste'
