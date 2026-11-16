import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { resolveLocale, setLocale, type Locale } from '@simple-copy/i18n'

async function start() {
  const locale = isTauri()
    ? await invoke<Locale>('system_locale').catch(() => 'en' as const)
    : resolveLocale(navigator.languages)
  setLocale(locale)
  ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
}
void start()
