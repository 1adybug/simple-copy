import { t } from '@simple-copy/i18n'
import { useI18n } from '@simple-copy/i18n/react'
import logo from '@simple-copy/brand/logo.svg'
import { ArrowDownToLine, ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { demoViewMessage } from './demo-data'
import { syncDemoSettings } from './settings'

const downloadUrl = import.meta.env.VITE_DOWNLOAD_URL?.trim()
function WindowsMark() {
  return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M1 3.5 8.5 2.4v7H1zm8.5-1.3L19 1v8.4H9.5zM1 10.5h7.5v7L1 16.4zm8.5 0H19V19l-9.5-1.3z" /></svg>
}

function Brand({ footer = false }: { footer?: boolean }) {
  return <a className="brand" href="#top" aria-label={t('appName') + ' · ' + t('site.backToTop')}>
    <img src={logo} width={footer ? 34 : 38} height={footer ? 34 : 38} alt="" />
    <span>{t('appName')}</span>
  </a>
}

function ClipboardDemo() {
  const [view, setView] = useState<'history' | 'settings'>('history')
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const receiveView = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow
        || event.data?.type !== demoViewMessage) return
      if (event.data.view === 'history' || event.data.view === 'settings') setView(event.data.view)
    }
    window.addEventListener('message', receiveView)
    return () => window.removeEventListener('message', receiveView)
  }, [])

  return <div className="demo-scene" id="demo" role="region" aria-label={t('site.demo')}>
    <iframe ref={frame} className="demo-window" data-view={view} src="./demo.html"
      onLoad={syncDemoSettings} title={`${t('appName')} · ${t('site.demo')}`}
      width={view === 'settings' ? 480 : 360} height={view === 'settings' ? 640 : 400} />
  </div>
}

export default function App() {
  const { locale } = useI18n()
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
      <a className="header-download" href={downloadUrl || '#demo'}>
        {downloadUrl ? <>{t('site.getWindows')}<ArrowDownToLine size={15} /></> : <>{t('site.try')}<ArrowRight size={15} /></>}
      </a>
    </header>

    <main id="main">
      <section className="hero section-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title" tabIndex={-1}>{t('site.heroLead')}<br /><span>{t('site.heroEnd')}</span></h1>
          <p className="hero-description">{t('site.heroDescription')}</p>
          <div className="hero-actions">
            {downloadUrl && <a className="button button-primary" href={downloadUrl}><WindowsMark />{t('site.getWindows')}<ArrowDownToLine size={17} /></a>}
            <a className={`button ${downloadUrl ? 'button-text' : 'button-primary'}`} href="#demo">{t('site.try')}<ArrowRight size={17} /></a>
          </div>
        </div>
        <ClipboardDemo />
      </section>
    </main>

    <footer className="site-footer section-shell"><Brand footer /><a href="#top">{t('site.backToTop')}<ArrowRight size={14} /></a></footer>
  </>
}
