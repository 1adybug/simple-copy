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
  return <a className="brand" href="#top" aria-label={product.name + '，回到顶部'}>
    <img src={logo} width={footer ? 34 : 38} height={footer ? 34 : 38} alt="" />
    <span>{product.name}</span>
  </a>
}

function ClipboardDemo() {
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

  return <div className="demo-scene" id="demo" role="region" aria-label="剪贴板演示">
    <iframe ref={frame} key={generation} className="demo-window" src="./demo.html"
      title="Simple Copy 剪贴板演示" width={360} height={400} />
    <div className="demo-controls"><button type="button" onClick={() => {
      setGeneration((previous) => previous + 1)
      setPasted(null)
      setFeedback('演示已重置。')
    }}><RotateCcw size={12} aria-hidden="true" />重置演示</button></div>
    <div className="demo-note">
      <div className="note-label"><FileText size={13} />示例便笺</div>
      <p className={pasted ? 'note-text has-content' : 'note-text'}>{pasted ?? '点击记录，粘贴到这里。'}</p>
    </div>
    <p className="demo-status" role="status">{feedback}</p>
    <p className="demo-disclaimer">仅使用示例内容，不读取系统剪贴板。</p>
  </div>
}

const formats = [
  { label: '纯文本', icon: Type },
  { label: '链接', icon: Link },
  { label: '富文本', icon: FileText },
  { label: '图片', icon: Image },
  { label: '文件引用', icon: Folder },
]

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
    <h2 id="download-title">开始使用</h2>
    {downloadUrl ? <>
      <a className="button button-primary" href={downloadUrl}><WindowsMark />下载 Windows 版<ArrowDownToLine size={17} /></a>
      <p className="download-meta">安装后按 Win + V 打开</p>
    </> : <div className="build-guide">
      <div className="build-guide-heading"><span><WindowsMark />从源码构建 Windows 版</span><button className="copy-command" type="button" disabled={copyState === 'busy'} aria-busy={copyState === 'busy'} onClick={() => void copyCommand()}>
        {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}{copyState === 'copied' ? '已复制' : copyState === 'busy' ? '正在复制' : '复制命令'}
      </button></div>
      <p>在项目源码目录运行：</p>
      <pre tabIndex={0} role="region" aria-label="Windows 安装包构建命令"><code>{buildCommand}</code></pre>
      <p className="build-requirements">构建需要 Node.js 24、pnpm 11、Rust、MSVC C++ Build Tools 与 WebView2。</p>
      <p className="copy-status" role="status">{copyState === 'error' ? '无法自动复制，请选中上方命令手动复制。' : copyState === 'copied' ? '构建命令已复制到剪贴板。' : ''}</p>
    </div>}
  </section>
}

export default function App() {
  return <>
    <a className="skip-link" href="#hero-title">跳到主要内容</a>
    <header className="site-header section-shell" id="top">
      <Brand />
      <a className="header-download" href="#download">获取 Windows 版<ArrowDownToLine size={15} /></a>
    </header>

    <main id="main">
      <section className="hero section-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title" tabIndex={-1}>把复制过的，<br /><span>留在手边。</span></h1>
          <p className="hero-description">按 Win + V，找回复制过的内容。</p>
          <div className="hero-actions"><a className="button button-primary" href="#download"><WindowsMark />获取 Windows 版<ArrowDownToLine size={17} /></a><a className="button button-text" href="#demo">先试一试<ArrowRight size={17} /></a></div>
        </div>
        <ClipboardDemo />
      </section>

      <ol className="workflow section-shell" aria-label="使用步骤">
        <li><kbd>Ctrl + C</kbd><span>复制</span></li>
        <li><kbd>Win + V</kbd><span>打开历史</span></li>
        <li><span>点击记录</span><span>粘贴</span></li>
      </ol>

      <section className="features-section section-shell" id="features" aria-labelledby="formats-title">
        <h2 id="formats-title">支持的格式</h2>
        <ul className="formats-grid">{formats.map(({ label, icon: Icon }) => <li key={label}><Icon size={22} aria-hidden="true" />{label}</li>)}</ul>
        <div className="feature-notes"><p><Pin size={16} aria-hidden="true" />置顶常用内容</p><p><RotateCcw size={16} aria-hidden="true" />常驻恢复，按需开启</p></div>
      </section>

      <GetApp />
    </main>

    <footer className="site-footer section-shell"><Brand footer /><a href="#top">回到顶部<ArrowRight size={14} /></a></footer>
  </>
}
