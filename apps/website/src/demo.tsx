import { resolveLocale, setLocale, t } from '@simple-copy/i18n'
import { HistoryPanel, type HistoryAction } from '@simple-copy/ui'
import '@simple-copy/ui/styles.css'
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createDemoClips, demoPasteMessage } from './demo-data'

function noWindowAction() {}

function Demo() {
  const [clips, setClips] = useState(createDemoClips)
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
      setMessage(t('native.cleared'))
      return
    }
    const clip = clips.find((item) => item.id === action.id)
    if (!clip) return
    switch (action.type) {
      case 'paste':
        window.parent.postMessage({ type: demoPasteMessage, text: clip.text }, location.origin)
        setMessage(t('site.pasted'))
        break
      case 'copy':
        copying.current = true
        setBusy(true)
        setMessage(null)
        try {
          await navigator.clipboard.writeText(clip.text)
          setMessage(t('site.sampleCopied'))
        } catch {
          setError(t('site.sampleCopyError'))
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
        setMessage(action.pinned ? t('site.pinned') : t('site.unpinned'))
        break
      }
      case 'delete':
        setClips((previous) => previous.filter((item) => item.id !== clip.id))
        setMessage(t('native.deleted'))
        break
    }
  }

  return <HistoryPanel items={items} busy={busy} error={error} message={message} onAction={(request) => { void action(request) }}
    onOpenSettings={noWindowAction} onDismiss={noWindowAction}
    onClearMessage={() => { setMessage(null); setError(null) }} />
}

const followLanguage = () => {
  setLocale(resolveLocale(navigator.languages))
  document.title = `${t('site.demo')} · ${t('appName')}`
}
followLanguage()
window.addEventListener('languagechange', followLanguage)

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>)
