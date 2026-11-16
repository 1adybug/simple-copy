import { getCurrentWindow } from '@tauri-apps/api/window'
import { useState, type ReactNode } from 'react'
import { Feedback, IconButton } from '@simple-copy/ui/app-controls'
import { WindowFrame } from '@simple-copy/ui/window-frame'
import { CloseIcon } from '@simple-copy/ui/icons/window-action-icons'
import { errorText } from '../native'

export function SettingsWindow({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null)

  async function close() {
    try {
      setError(null)
      await getCurrentWindow().close()
    } catch (reason) { setError(errorText(reason)) }
  }

  return (
    <WindowFrame title={"设置"} view="settings" actions={
      <IconButton label={"关闭设置"} onClick={() => void close()}><CloseIcon /></IconButton>
    }>
      {children}
      {error && <div className="window-feedback"><Feedback error={error} onDismiss={() => setError(null)} /></div>}
    </WindowFrame>
  )
}
