import { Feedback } from '@simple-copy/ui/app-controls'
import { Button } from '@simple-copy/ui/ui/button'
import { LoaderCircle } from 'lucide-react'
import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react'
import { SettingsWindow } from './components/settings-window'
import { HistoryWindow } from './history-window'
import { useClipboard } from './native'
import { useTheme } from './theme'

const SettingsView = lazy(() => import('./SettingsView'))

export default function App() {
  const state = useClipboard()
  const settingsWindow = new URLSearchParams(location.search).get('view') === 'settings'
  useTheme(state.snapshot?.settings.themeMode ?? 'system')
  useEffect(() => { document.title = `${(settingsWindow ? "设置" : "剪贴板")} · Simple Copy` }, [settingsWindow])
  return settingsWindow
    ? <SettingsWindow>
      <SettingsBoundary>
        <Suspense fallback={<div className="settings-loading" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" />{"正在载入设置"}</div>}>
          <SettingsView state={state} />
        </Suspense>
      </SettingsBoundary>
    </SettingsWindow>
    : <HistoryWindow state={state} />
}

class SettingsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <div className="settings-loading">
        <Feedback error={"设置页面未能载入，请重新载入。"} />
        <Button variant="secondary" onClick={() => location.reload()}>{"重新载入"}</Button>
      </div>
      : this.props.children
  }
}
