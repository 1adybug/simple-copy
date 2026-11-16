import { t } from '@simple-copy/i18n'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip, HistoryAction, Settings, SettingsPatch } from '@simple-copy/ui/types'
import { errorText } from '@simple-copy/ui/errors'

export type { Clip, Kind, Retention, ThemeMode, Settings } from '@simple-copy/ui/types'
export { errorText } from '@simple-copy/ui/errors'
export { shortcutLabel } from '@simple-copy/ui/shortcuts'

function applySettingsPatch(settings: Settings, patch: SettingsPatch): Settings {
  return { ...settings, ...patch, formats: { ...settings.formats, ...patch.formats } }
}

export interface Snapshot {
  revision: number
  popupToken: number
  items: Clip[]
  settings: Settings
  capabilities: {
    platform: string
    background: boolean
    automaticPaste: boolean
    restoreAvailable: boolean
    canAuthorize: boolean
    message: string | null
  }
  storageStatus: string | null
  shortcutError: string | null
  error: string | null
  restorePending: boolean
}

export type Action = HistoryAction

interface Operation { message: string | null }

export const desktop = isTauri()


export function useClipboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [settingsChanges, setSettingsChanges] = useState<SettingsPatch[]>([])
  const currentSnapshot = useRef<Snapshot | null>(null)
  const pendingSettings = useRef<SettingsPatch[]>([])
  const settingsQueue = useRef(Promise.resolve(true))
  const settingsFailures = useRef(0)
  const running = useRef(false)
  const popupToken = useRef(0)

  const update = useCallback((next: Snapshot) => {
    popupToken.current = Math.max(popupToken.current, next.popupToken)
    if (!currentSnapshot.current || next.revision >= currentSnapshot.current.revision) {
      currentSnapshot.current = next
      setSnapshot(next)
    }
  }, [])

  const refresh = useCallback(async () => {
    update(await invoke<Snapshot>('clipboard_snapshot'))
  }, [update])

  useEffect(() => {
    if (!desktop) {
      setError(t('desktopOnly'))
      return
    }
    let disposed = false
    let unlisten: (() => void) | undefined
    let unlistenPopup: (() => void) | undefined
    void listen<number>('popup-opened', ({ payload }) => {
      popupToken.current = Math.max(popupToken.current, payload)
    }).then((stop) => { if (disposed) stop(); else unlistenPopup = stop })
      .catch((reason: unknown) => { if (!disposed) setError(errorText(reason)) })
    void listen<Snapshot>('clipboard-state', (event) => {
      if (!disposed) update(event.payload)
    }).then(async (stop) => {
      if (disposed) { stop(); return }
      unlisten = stop
      await refresh()
    }).catch((reason: unknown) => { if (!disposed) setError(errorText(reason)) })
    return () => { disposed = true; unlisten?.(); unlistenPopup?.() }
  }, [refresh, update])

  const run = useCallback(async (command: string, args?: Record<string, unknown>) => {
    if (running.current) return false
    running.current = true
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await invoke<Operation>(command, args)
      setMessage(result.message)
      await refresh()
      return true
    } catch (reason) {
      setError(errorText(reason))
      return false
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [refresh, running])

  const save = useCallback((patch: SettingsPatch) => {
    pendingSettings.current = [...pendingSettings.current, patch]
    setSettingsChanges(pendingSettings.current)
    setError(null)
    setMessage(null)
    const result = settingsQueue.current.then(async () => {
      try {
        const settings = currentSnapshot.current?.settings
        if (!settings) throw new Error(t('settingsNotLoaded'))
        update(await invoke<Snapshot>('save_settings', { settings: applySettingsPatch(settings, patch) }))
        setMessage(t('saved'))
        return true
      } catch (reason) {
        settingsFailures.current += 1
        setError(errorText(reason))
        await refresh().catch(() => {})
        return false
      } finally {
        pendingSettings.current = pendingSettings.current.filter((change) => change !== patch)
        setSettingsChanges(pendingSettings.current)
      }
    })
    settingsQueue.current = result
    return result
  }, [refresh, update])

  const flushSettings = useCallback(async () => {
    const failures = settingsFailures.current
    let queue: Promise<boolean>
    do {
      queue = settingsQueue.current
      await queue
    } while (queue !== settingsQueue.current)
    return settingsFailures.current === failures
  }, [])

  return {
    snapshot, error, busy, message,
    settings: snapshot ? settingsChanges.reduce(applySettingsPatch, snapshot.settings) : null,
    savingSettings: settingsChanges.length > 0,
    save, flushSettings,
    clearMessage: useCallback(() => { setMessage(null); setError(null) }, []),
    action: (action: Action) => run('history_action', { action, popupToken: popupToken.current }),
    capture: () => run('capture_current'),
  }
}
