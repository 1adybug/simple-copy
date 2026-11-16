import logo from '@simple-copy/brand/logo.svg'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Copy, Minus, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Feedback, IconButton } from './app-controls'
import { desktop, errorText } from '../native'

export function SettingsHeader() {
  const [maximized, setMaximized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!desktop) return
    let disposed = false
    const window = getCurrentWindow()
    const refresh = () => {
      void window.isMaximized().then((value) => {
        if (!disposed) setMaximized(value)
      }).catch((reason: unknown) => { if (!disposed) setError(errorText(reason)) })
    }
    refresh()
    const stop = window.onResized(refresh)
    return () => { disposed = true; void stop.then((unlisten) => unlisten()) }
  }, [])

  async function control(operation: 'minimize' | 'toggleMaximize' | 'close') {
    try {
      setError(null)
      await getCurrentWindow()[operation]()
    } catch (reason) { setError(errorText(reason)) }
  }

  return <>
    <header className="window-header">
      <div className="heading-row">
        <div className="window-heading" data-tauri-drag-region>
          <img src={logo} width={24} height={24} alt="" draggable={false} /><h1>设置</h1>
        </div>
        <div className="header-actions settings-window-actions" role="group" aria-label="窗口操作">
          <IconButton label="最小化" onClick={() => void control('minimize')}><Minus /></IconButton>
          <IconButton label={maximized ? '还原窗口' : '最大化'} onClick={() => void control('toggleMaximize')}>
            {maximized ? <Copy /> : <Square />}
          </IconButton>
          <IconButton label="关闭设置" className="window-close" onClick={() => void control('close')}><X /></IconButton>
        </div>
      </div>
    </header>
    {error && <div className="window-control-error"><Feedback error={error} onDismiss={() => setError(null)} /></div>}
  </>
}
