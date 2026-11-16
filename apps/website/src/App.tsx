import { t } from '@simple-copy/i18n'
import { useI18n } from '@simple-copy/i18n/react'
import { product } from '@simple-copy/brand'
import logo from '@simple-copy/brand/logo.svg'
import {
  ArrowDownToLine, ArrowRight, Check, Copy, FileText, Folder, Image,
  Link, Pin, RotateCcw, Type,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { demoPasteMessage } from './demo-data'

const downloadUrl = import.meta.env.VITE_DOWNLOAD_URL?.trim()
const buildCommand = 'pnpm install --frozen-lockfile\npnpm build:installer'


function WindowsMark({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M1 3.5 8.5 2.4v7H1zm8.5-1.3L19 1v8.4H9.5zM1 10.5h7.5v7L1 16.4zm8.5 0H19V19l-9.5-1.3z" /></svg>
}

function Brand({ footer = false }: { footer?: boolean }) {
  return <a className="brand" href="#top" aria-label={product.name + ' · ' + t('site.backToTop')}>
    <img src={logo} width={footer ? 34 : 38} height={footer ? 34 : 38} alt="" />
    <span>{product.name}</span>
  </a>
}

function ClipboardDemo() {
  const { locale } = useI18n()
  const [generation, setGeneration] = useState(0)
  const [pasted, setPasted] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const receivePaste = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow
        || event.data?.type !== demoPasteMessage || typeof event.data.text !== 'string') return
      setPasted(event.data.text)
      setFeedback('')
    }
    window.addEventListener('message', receivePaste)
    return () => window.removeEventListener('message', receivePaste)
  }, [])

  return <div className="demo-scene" id="demo" role="region" aria-label={t('site.demo')}>
    <iframe ref={frame} key={`${locale}-${generation}`} className="demo-window" src="./demo.html"
      title={`Simple Copy · ${t('site.demo')}`} width={360} height={400} />
    <div className="demo-controls"><button type="button" onClick={() => {
      setGeneration((previous) => previous + 1)
      setPasted(null)
      setFeedback(t('site.resetDone'))
    }}><RotateCcw size={12} aria-hidden="true" />{t('site.reset')}</button></div>
    <div className="demo-note">
      <div className="note-label"><FileText size={13} />{t('site.sampleNoteLabel')}</div>
      <p className={pasted ? 'note-text has-content' : 'note-text'}>{pasted ?? t('site.noteEmpty')}</p>
    </div>
    <p className="demo-status" role="status">{feedback}</p>
    <p className="demo-disclaimer">{t('site.disclaimer')}</p>
  </div>
}

const formats = [
  { key: 'text', icon: Type },
  { key: 'link', icon: Link },
  { key: 'richText', icon: FileText },
  { key: 'image', icon: Image },
  { key: 'files', icon: Folder },
] as const

function GetApp() {
  const [copyState, setCopyState] = useState<'idle' | 'busy' | 'copied' | 'error'>('idle')
  const copying = useRef(false)

  async function copyCommand() {
    if (copying.current) return
    copying.current = true
    setCopyState('busy')
    try {
      await navigator.clipboard.writeText(buildCommand)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    } finally {
      copying.current = false
    }
  }

  return <section className="download-section section-shell" id="download" aria-labelledby="download-title">
    <h2 id="download-title">{t('site.getStarted')}</h2>
    {downloadUrl ? <>
      <a className="button button-primary" href={downloadUrl}><WindowsMark />{t('site.download')}<ArrowDownToLine size={17} /></a>
      <p className="download-meta">{t('site.afterInstall')}</p>
    </> : <div className="build-guide">
      <div className="build-guide-heading"><span><WindowsMark />{t('site.build')}</span><button className="copy-command" type="button" disabled={copyState === 'busy'} aria-busy={copyState === 'busy'} onClick={() => void copyCommand()}>
        {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}{copyState === 'copied' ? t('native.copied') : copyState === 'busy' ? t('site.copying') : t('site.copyCommand')}
      </button></div>
      <p>{t('site.runCommand')}</p>
      <pre tabIndex={0} role="region" aria-label={t('site.buildCommand')}><code>{buildCommand}</code></pre>
      <p className="build-requirements">{t('site.requirements')}</p>
      <p className="copy-status" role="status">{copyState === 'error' ? t('site.copyError') : copyState === 'copied' ? t('site.commandCopied') : ''}</p>
    </div>}
  </section>
}

export default function App() {
  const { locale } = useI18n()
  useEffect(() => {
    document.title = t('site.title')
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('site.description'))
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', t('site.title'))
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', t('site.ogDescription'))
    const ogLocales = { en: 'en_US', 'zh-CN': 'zh_CN', 'zh-TW': 'zh_TW', ja: 'ja_JP', ko: 'ko_KR', de: 'de_DE', fr: 'fr_FR', es: 'es_ES', pt: 'pt_BR', ru: 'ru_RU' }
    document.querySelector('meta[property="og:locale"]')?.setAttribute('content', ogLocales[locale])
  }, [locale])
  return <>
    <a className="skip-link" href="#hero-title">{t('site.skip')}</a>
    <header className="site-header section-shell" id="top">
      <Brand />
      <a className="header-download" href="#download">{t('site.getWindows')}<ArrowDownToLine size={15} /></a>
    </header>

    <main id="main">
      <section className="hero section-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title" tabIndex={-1}>{t('site.heroLead')}<br /><span>{t('site.heroEnd')}</span></h1>
          <p className="hero-description">{t('site.heroDescription')}</p>
          <div className="hero-actions"><a className="button button-primary" href="#download"><WindowsMark />{t('site.getWindows')}<ArrowDownToLine size={17} /></a><a className="button button-text" href="#demo">{t('site.try')}<ArrowRight size={17} /></a></div>
        </div>
        <ClipboardDemo />
      </section>

      <ol className="workflow section-shell" aria-label={t('site.steps')}>
        <li><kbd>Ctrl + C</kbd><span>{t('copy')}</span></li>
        <li><kbd>Win + V</kbd><span>{t('site.openHistory')}</span></li>
        <li><span>{t('site.clickRecord')}</span><span>{t('site.paste')}</span></li>
      </ol>

      <section className="features-section section-shell" id="features" aria-labelledby="formats-title">
        <h2 id="formats-title">{t('site.formats')}</h2>
        <ul className="formats-grid">{formats.map(({ key, icon: Icon }) => <li key={key}><Icon size={22} aria-hidden="true" />{t(`format.${key}`)}</li>)}</ul>
        <div className="feature-notes"><p><Pin size={16} aria-hidden="true" />{t('site.pinFeature')}</p><p><RotateCcw size={16} aria-hidden="true" />{t('site.restoreFeature')}</p></div>
      </section>

      <GetApp />
    </main>

    <footer className="site-footer section-shell"><Brand footer /><a href="#top">{t('site.backToTop')}<ArrowRight size={14} /></a></footer>
  </>
}
