import { t } from '@simple-copy/i18n'
import { useI18n } from '@simple-copy/i18n/react'
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
  const { locale } = useI18n()
  const state = useClipboard()
  const settingsWindow = new URLSearchParams(location.search).get('view') === 'settings'
  useTheme(state.snapshot?.settings.themeMode ?? 'system')
  useEffect(() => { document.title = `${t(settingsWindow ? 'settings' : 'clipboard')} · Simple Copy` }, [settingsWindow, locale])
  return settingsWindow
    ? <SettingsWindow>
      <SettingsBoundary>
        <Suspense fallback={<div className="settings-loading" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" />{t('loadingSettings')}</div>}>
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
        <Feedback error={t('settingsLoadError')} />
        <Button variant="secondary" onClick={() => location.reload()}>{t('reload')}</Button>
      </div>
      : this.props.children
  }
}
