import { HistoryPanel, type HistoryAction } from '@simple-copy/ui'
import '@simple-copy/ui/styles.css'
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { demoClips, demoPasteMessage } from './demo-data'

function noWindowAction() {}

function Demo() {
  const [clips, setClips] = useState(demoClips)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const copying = useRef(false)
  const items = [
    ...clips.filter((clip) => clip.pinned),
    ...clips.filter((clip) => !clip.pinned).sort((a, b) => a.id - b.id),
  ]

  async function action(action: HistoryAction) {
    if (copying.current) return
    setError(null)
    if (action.type === 'clearUnpinned') {
      setClips((previous) => previous.filter((clip) => clip.pinned))
      setMessage('已清除未置顶记录。')
      return
    }
    const clip = clips.find((item) => item.id === action.id)
    if (!clip) return
    switch (action.type) {
      case 'paste':
        window.parent.postMessage({ type: demoPasteMessage, text: clip.text }, location.origin)
        setMessage('已粘贴到便笺。')
        break
      case 'copy':
        copying.current = true
        setBusy(true)
        setMessage(null)
        try {
          await navigator.clipboard.writeText(clip.text)
          setMessage('示例内容已复制。')
        } catch {
          setError('无法复制，请重试。')
        } finally {
          copying.current = false
          setBusy(false)
        }
        break
      case 'pin': {
        const updated = { ...clip, pinned: action.pinned }
        setClips((previous) => action.pinned
          ? [updated, ...previous.filter((item) => item.id !== clip.id)]
          : previous.map((item) => item.id === clip.id ? updated : item))
        setMessage(action.pinned ? '已置顶。' : '已取消置顶。')
        break
      }
      case 'delete':
        setClips((previous) => previous.filter((item) => item.id !== clip.id))
        setMessage('记录已删除。')
        break
    }
  }

  return <HistoryPanel items={items} busy={busy} error={error} message={message} onAction={(request) => { void action(request) }}
    onOpenSettings={noWindowAction} onDismiss={noWindowAction}
    onClearMessage={() => { setMessage(null); setError(null) }} />
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>)
