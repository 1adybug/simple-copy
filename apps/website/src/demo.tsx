import { t } from '@simple-copy/i18n'
import { useI18n } from '@simple-copy/i18n/react'
import logo from '@simple-copy/brand/logo.svg'
import { HistoryPanel, type HistoryAction } from '@simple-copy/ui'
import { SettingsPanel } from '@simple-copy/ui/settings-panel'
import { IconButton } from '@simple-copy/ui/app-controls'
import { WindowFrame } from '@simple-copy/ui/window-frame'
import { CloseIcon } from '@simple-copy/ui/icons/window-action-icons'
import type { SettingsPatch, UpdateController } from '@simple-copy/ui/types'
import '@simple-copy/ui/styles.css'
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createDemoClips, demoViewMessage, focusDemoMessage } from './demo-data'
import { saveWebsiteSettings, useWebsiteSettings } from './settings'
import { version } from '../package.json'

function noWindowAction() {}

const updates: UpdateController = {
  snapshot: { revision: 0, currentVersion: version, status: 'unavailable', version: null, downloaded: 0, total: null },
  busy: false, error: null, check: async () => {}, install: async () => {},
}

function Demo() {
  const { locale } = useI18n()
  const settings = useWebsiteSettings()
  const [view, setView] = useState<'history' | 'settings'>('history')
  const [resetKey, setResetKey] = useState(window.parent === window ? 0 : undefined)
  const [records, setRecords] = useState(() => createDemoClips().map(({ id, pinned }) => ({ id, pinned })))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const copying = useRef(false)
  const previousView = useRef(view)
  const samples = createDemoClips(locale)
  const clips = records.map((record) => ({ ...samples.find((sample) => sample.id === record.id)!, pinned: record.pinned }))
  const items = [
    ...clips.filter((clip) => clip.pinned),
    ...clips.filter((clip) => !clip.pinned).sort((a, b) => a.id - b.id),
  ]

  useEffect(() => {
    if (view !== 'history') return
    const receiveFocus = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === window.parent && event.data?.type === focusDemoMessage) {
        setResetKey((previous) => (previous ?? 0) + 1)
      }
    }
    window.addEventListener('message', receiveFocus)
    return () => window.removeEventListener('message', receiveFocus)
  }, [view])

  useEffect(() => {
    document.title = `${t('site.demo')} · ${t('appName')}`
    window.parent.postMessage({ type: demoViewMessage, view }, location.origin)
    if (previousView.current !== view) {
      document.querySelector<HTMLButtonElement>(view === 'settings'
        ? '.settings-window .header-actions button' : '.history-window .header-actions button:nth-child(2)')?.focus()
      previousView.current = view
    }
  }, [locale, view])

  useEffect(() => {
    if (view !== 'settings') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing && !event.defaultPrevented
        && !document.querySelector('[role="listbox"], [role="alertdialog"]')) setView('history')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [view])

  async function save(patch: SettingsPatch) {
    await saveWebsiteSettings(patch)
    if (patch.maxHistoryItems !== undefined && patch.maxHistoryItems > 0) {
      const limit = patch.maxHistoryItems
      setRecords((previous) => {
        let ordinary = 0
        return previous.filter((record) => record.pinned || ordinary++ < limit)
      })
    }
    setMessage(t('saved'))
    return true
  }

  async function action(action: HistoryAction) {
    if (copying.current) return
    setError(null)
    if (action.type === 'clearUnpinned') {
      setRecords((previous) => previous.filter((clip) => clip.pinned))
      setMessage(t('native.cleared'))
      return
    }
    const clip = clips.find((item) => item.id === action.id)
    if (!clip) return
    switch (action.type) {
      case 'paste':
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
        const updated = { id: clip.id, pinned: action.pinned }
        setRecords((previous) => action.pinned
          ? [updated, ...previous.filter((item) => item.id !== clip.id)]
          : previous.map((item) => item.id === clip.id ? updated : item))
        setMessage(action.pinned ? t('site.pinned') : t('site.unpinned'))
        break
      }
      case 'delete':
        setRecords((previous) => previous.filter((item) => item.id !== clip.id))
        setMessage(t('native.deleted'))
        break
    }
  }

  return <>
    <div hidden={view !== 'history'}>
      <HistoryPanel items={items} busy={busy} error={error} message={message} resetKey={resetKey} onAction={(request) => { void action(request) }}
        onOpenSettings={() => { setMessage(null); setError(null); setView('settings') }} onDismiss={noWindowAction}
        renderImage={() => <span className="clip-image-frame"><img className="clip-image" src={logo} alt={t('imageAlt')} draggable={false} decoding="async" /></span>}
        onClearMessage={() => { setMessage(null); setError(null) }} />
    </div>
    {view === 'settings' && <WindowFrame title={t('settings')} view="settings" actions={
      <IconButton label={t('closeSettings')} onClick={() => setView('history')}><CloseIcon /></IconButton>
    }>
      <SettingsPanel updates={updates} state={{ settings, savingSettings: false, save, error, message,
        snapshot: {
          shortcutError: null, storageStatus: null, startupAvailable: true, startupError: null,
          capabilities: { restoreAvailable: true, message: null },
        },
        clearMessage: () => { setMessage(null); setError(null) },
      }} />
    </WindowFrame>}
  </>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>)
