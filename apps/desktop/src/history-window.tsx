import { HistoryPanel, type HistoryNavigationKey, type HistoryPanelHandle } from '@simple-copy/ui'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'
import { ClipImage, useThumbnailVisibility } from './components/clip-image'
import { desktop, errorText, type useClipboard } from './native'

function dismissHistory() {
  void invoke('hide_history').catch(() => {})
}

export function HistoryWindow({ state }: { state: ReturnType<typeof useClipboard> }) {
  const [navigationError, setNavigationError] = useState<string | null>(null)
  const history = useRef<HistoryPanelHandle>(null)
  const list = useRef<HTMLDivElement>(null)
  const observeThumbnail = useThumbnailVisibility(list)
  const { snapshot, popup, clearMessage } = state

  useEffect(() => {
    if (popup.token > 0) clearMessage()
  }, [popup.token, clearMessage])
  useEffect(() => {
    if (!desktop) return
    const unlisten = listen<[number, HistoryNavigationKey]>('popup-navigation', ({ payload: [token, key] }) => {
      history.current?.navigate(key, token)
    })
    return () => { void unlisten.then((stop) => stop()) }
  }, [])

  return <HistoryPanel items={snapshot?.items ?? []} busy={state.busy} loading={!snapshot && desktop}
    error={navigationError || state.error || snapshot?.error || snapshot?.shortcutError}
    message={state.message} resetKey={popup.token} passive={popup.mode === 'passive'} listRef={list} navigationRef={history}
    onAction={(action) => { void state.action(action) }}
    onOpenSettings={() => { void invoke('open_settings').catch((error: unknown) => setNavigationError(errorText(error))) }}
    onDismiss={dismissHistory}
    onCapture={snapshot && !snapshot.capabilities.background ? () => { void state.capture() } : undefined}
    onClearMessage={navigationError || state.error || state.message
      ? () => { setNavigationError(null); clearMessage() } : undefined}
    renderImage={(clip) => <ClipImage id={clip.id} observe={observeThumbnail} />} />
}
