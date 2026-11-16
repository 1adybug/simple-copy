import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { resolveLocale, setLocale } from '@simple-copy/i18n'

const followLanguage = () => setLocale(resolveLocale(navigator.languages))
followLanguage()
window.addEventListener('languagechange', followLanguage)

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
