import { t } from '@simple-copy/i18n'
import { useI18n } from '@simple-copy/i18n/react'
import logo from '@simple-copy/brand/logo.svg'
import { ArrowDownToLine, ArrowRight, ArrowUp, ArrowUpRight } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { demoViewMessage, focusDemoMessage } from './demo-data'
import { syncDemoSettings } from './settings'

const repositoryUrl = 'https://github.com/1adybug/simple-copy'
const downloadUrl = import.meta.env.VITE_DOWNLOAD_URL?.trim() || `${repositoryUrl}/releases`

function WindowsMark() {
  return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M1 3.5 8.5 2.4v7H1zm8.5-1.3L19 1v8.4H9.5zM1 10.5h7.5v7L1 16.4zm8.5 0H19V19l-9.5-1.3z" /></svg>
}

function Brand({ footer = false }: { footer?: boolean }) {
  return <a className="brand" href="#top" aria-label={t('appName') + ' · ' + t('site.backToTop')}>
    <img src={logo} width={footer ? 28 : 38} height={footer ? 28 : 38} alt="" />
    <span>{t('appName')}</span>
  </a>
}

function ClipboardDemo({ openRequest }: { openRequest: number }) {
  const [view, setView] = useState<'history' | 'settings' | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const ready = view !== null

  useEffect(() => {
    const receiveView = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow
        || event.data?.type !== demoViewMessage) return
      if (event.data.view === 'history' || event.data.view === 'settings') setView(event.data.view)
    }
    window.addEventListener('message', receiveView)
    return () => window.removeEventListener('message', receiveView)
  }, [])

  useEffect(() => {
    if (ready && openRequest > 0) frame.current?.contentWindow?.postMessage({ type: focusDemoMessage }, location.origin)
  }, [openRequest, ready])

  useLayoutEffect(() => {
    if (view === 'settings') {
      frame.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    }
  }, [view])

  return <div className="demo-scene" id="demo" role="region" aria-label={t('site.demo')}>
    <iframe ref={frame} className="demo-window" data-view={view ?? 'history'} src="./demo.html"
      onLoad={syncDemoSettings} title={`${t('appName')} · ${t('site.demo')}`}
      width={view === 'settings' ? 480 : 360} height={view === 'settings' ? 640 : 400} />
  </div>
}

export default function App() {
  const { locale } = useI18n()
  const [demoOpenRequest, setDemoOpenRequest] = useState(0)

  function openDemo(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      setDemoOpenRequest((previous) => previous + 1)
    }
  }

  useEffect(() => {
    document.title = t('site.title')
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('site.description'))
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', t('site.title'))
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', t('site.ogDescription'))
    document.querySelector('meta[property="og:site_name"]')?.setAttribute('content', t('appName'))
    const ogLocales = { en: 'en_US', 'zh-CN': 'zh_CN', 'zh-TW': 'zh_TW', ja: 'ja_JP', ko: 'ko_KR', de: 'de_DE', fr: 'fr_FR', es: 'es_ES', pt: 'pt_BR', ru: 'ru_RU' }
    document.querySelector('meta[property="og:locale"]')?.setAttribute('content', ogLocales[locale])
  }, [locale])
  return <>
    <a className="skip-link" href="#hero-title">{t('site.skip')}</a>
    <header className="site-header section-shell" id="top">
      <Brand />
      <nav className="header-links">
        <a className="header-repository" href={repositoryUrl} target="_blank" rel="noopener noreferrer">
          GitHub<ArrowUpRight size={15} aria-hidden="true" />
        </a>
        <a className="header-download" href={downloadUrl} aria-label={t('site.getWindows')} title={t('site.getWindows')}>
          <ArrowDownToLine size={16} aria-hidden="true" /><span>{t('site.getWindows')}</span>
        </a>
      </nav>
    </header>

    <main id="main">
      <section className="hero section-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="hero-shortcut">
            <kbd className="shortcut-keys"><kbd>Win</kbd>{' + '}<kbd>V</kbd></kbd>{' '}
            {t('site.openHistory')}
          </p>
          <h1 id="hero-title" tabIndex={-1}>
            {t('site.heroLead')}{' '}
            <span className="hero-selection">{t('site.heroEnd')}</span>
          </h1>
          <p className="hero-description">{t('site.heroDescription')}</p>
          <div className="hero-actions">
            <a className="button button-primary" href={downloadUrl}><WindowsMark />{t('site.getWindows')}</a>
            <a className="button button-text" href="#demo" onClick={openDemo}>{t('site.try')}<ArrowRight size={17} aria-hidden="true" /></a>
          </div>
        </div>
        <ClipboardDemo openRequest={demoOpenRequest} />
      </section>
    </main>

    <footer className="site-footer">
      <div className="footer-content section-shell">
        <Brand footer />
        <a className="back-to-top" href="#top">{t('site.backToTop')}<ArrowUp size={15} aria-hidden="true" /></a>
      </div>
    </footer>
  </>
}
