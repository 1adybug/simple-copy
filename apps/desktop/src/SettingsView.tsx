import { SettingsPanel, type ShortcutRecorder } from '@simple-copy/ui/settings-panel'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useRef, useState } from 'react'
import { desktop, errorText, type useClipboard } from './native'

const shortcutRecorder: ShortcutRecorder = {
  start: () => invoke('record_shortcut', { recording: true }),
  stop: () => invoke('record_shortcut', { recording: false }),
  subscribe: (onRecorded) => listen<string>('shortcut-recorded', ({ payload }) => onRecorded(payload)),
}

export default function SettingsView({ state }: { state: ReturnType<typeof useClipboard> }) {
  const [closeError, setCloseError] = useState<string | null>(null)
  const closing = useRef(false)
  const { flushSettings } = state

  useEffect(() => {
    if (!desktop) return
    const window = getCurrentWindow()
    const stop = window.onCloseRequested((event) => {
      event.preventDefault()
      if (closing.current) return
      closing.current = true
      void flushSettings().then(async (saved) => {
        if (saved) await window.destroy()
      }).catch((reason: unknown) => setCloseError(errorText(reason)))
        .finally(() => { closing.current = false })
    })
    return () => { void stop.then((unlisten) => unlisten()) }
  }, [flushSettings])

  return <SettingsPanel shortcutRecorder={desktop ? shortcutRecorder : undefined} state={{
    ...state,
    error: closeError || state.error,
    clearMessage: () => { setCloseError(null); state.clearMessage() },
  }} />
}
