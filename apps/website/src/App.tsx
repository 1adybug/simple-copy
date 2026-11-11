import { product } from '@simple-copy/brand'
import logo from '@simple-copy/brand/logo.svg'
import {
  ArrowDown, ArrowDownToLine, ArrowRight, Check, ChevronDown, Clipboard,
  Copy, FileText, Folder, Image, Keyboard, Link, LockKeyhole, Pin,
  RotateCcw, ShieldCheck, Sparkles, Type,
} from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

const downloadUrl = import.meta.env.VITE_DOWNLOAD_URL?.trim()
const buildCommand = 'pnpm install --frozen-lockfile\npnpm build:installer'

const initialClips = [
  { id: 'idea', kind: '文字', text: '留一点空间，给下一个好想法。', pinned: true },
  { id: 'note', kind: '文字', text: '周五下午三点，带上新提案见面。', pinned: false },
  { id: 'link', kind: '链接', text: 'https://example.com/a-little-inspiration', pinned: false },
]

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
  const [clips, setClips] = useState(initialClips)
  const [pasted, setPasted] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('点一下记录，试试粘贴到便笺。')
  const ordered = [...clips.filter((clip) => clip.pinned), ...clips.filter((clip) => !clip.pinned)]

  function pin(id: string) {
    const clip = clips.find((item) => item.id === id)!
    const updated = { ...clip, pinned: !clip.pinned }
    setClips((previous) => updated.pinned
      ? [updated, ...previous.filter((item) => item.id !== id)]
      : previous.map((item) => item.id === id ? updated : item))
    setFeedback(updated.pinned ? '已置顶，这条内容会排在前面。' : '已取消置顶。')
  }

  function navigate(event: KeyboardEvent<HTMLUListElement>) {
    if (event.nativeEvent.isComposing || !(event.target instanceof HTMLButtonElement)
      || !event.target.classList.contains('demo-paste')) return
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.demo-paste'))
    const current = buttons.indexOf(event.target)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : Math.max(0, Math.min(buttons.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))
    event.preventDefault()
    buttons[next]?.focus()
  }

  return <div className="demo-scene" id="demo" role="region" aria-labelledby="demo-title">
    <div className="scene-caption"><span className="little-star"><Sparkles size={15} /></span> 刚才复制的，都在这里。</div>
    <div className="demo-window">
      <div className="demo-heading"><h2 id="demo-title"><Clipboard size={18} />剪贴板</h2><span className="demo-badge">交互演示</span></div>
      <div className="demo-toolbar"><span>{clips.length} 条记录</span><button type="button" onClick={() => {
        setClips(initialClips)
        setPasted(null)
        setFeedback('演示已重置，选一条内容继续试试。')
      }}><RotateCcw size={12} />重置演示</button></div>
      <ul className="demo-list" onKeyDown={navigate}>
        {ordered.map((clip) => <li className="demo-clip" key={clip.id} data-pinned={clip.pinned}>
          <button className="demo-paste" type="button" onClick={() => {
            setPasted(clip.text)
            setFeedback('已粘贴到下方便笺，可以再选一条。')
          }} aria-label={'将' + clip.text + '粘贴到示例便笺'}>
            <span className="clip-kind">{clip.kind === '链接' ? <Link size={12} /> : <Type size={12} />}{clip.kind}{clip.pinned && <span className="pinned-label">已置顶</span>}</span>
            <span className="clip-copy">{clip.text}</span>
          </button>
          <button className="demo-pin" type="button" aria-pressed={clip.pinned} aria-label={(clip.pinned ? '取消置顶：' : '置顶：') + clip.text} onClick={() => pin(clip.id)}>
            <Pin size={14} fill={clip.pinned ? 'currentColor' : 'none'} />
          </button>
        </li>)}
      </ul>
      <div className="demo-footer"><span><kbd>Win</kbd> + <kbd>V</kbd> 打开历史</span><span>随时，接着用。</span></div>
    </div>
    <div className="demo-note">
      <div className="note-label"><FileText size={13} />我的便笺<span>粘贴在这里 ↓</span></div>
      <p className={pasted ? 'note-text has-content' : 'note-text'}>{pasted ?? '刚才那句话，不用再找一遍。'}</p>
    </div>
    <p className="demo-status" role="status">{feedback}</p>
    <p className="demo-disclaimer">仅使用示例内容，不读取系统剪贴板。</p>
  </div>
}

const formats = [
  { label: '纯文本', detail: '灵感、代码，或一句话', icon: Type, className: 'format-text', sample: <><span>一个好想法，</span><strong>值得再用一次。</strong></> },
  { label: '链接', detail: '刚刚发现的那一页', icon: Link, className: 'format-link', sample: <><Link size={23} /><span>example.com<br /><small>留着，慢慢看。</small></span></> },
  { label: '富文本', detail: '带着原来的格式', icon: FileText, className: 'format-rich', sample: <><strong>保持原样。</strong><span><b>B</b><i>I</i><u>U</u><span className="text-swatch" /></span></> },
  { label: '图片', detail: '截图和复制的图像', icon: Image, className: 'format-image', sample: <svg viewBox="0 0 180 100" aria-hidden="true"><rect x="12" y="8" width="156" height="84" rx="8" fill="#e0d4eb" /><circle cx="126" cy="32" r="10" fill="#faf7fc" /><path d="m12 80 43-43 38 38 24-23 51 40H12Z" fill="#ad8bc1" /><path d="m12 88 43-43 44 47H12Z" fill="#85629c" /></svg> },
  { label: '文件', detail: '文件与文件夹的引用', icon: Folder, className: 'format-file', sample: <><Folder size={42} strokeWidth={1.25} /><span>下一版提案.pdf</span></> },
]

const questions = [
  { title: '它和 Windows 自带的剪贴板有什么不同？', answer: 'Simple Copy 在历史记录之外，提供置顶、本机加密存储、可选的历史保留方式和常驻恢复。默认使用 Win + V 呼出面板，会接管这个快捷键；也可以在设置中修改快捷键。' },
  { title: '退出软件后，复制的内容还会保留吗？', answer: '默认只保留置顶内容。你可以在设置中改为「仅本次运行」或「保留全部」。选择仅本次运行会清除磁盘中的历史；选择只保留置顶会移除磁盘中的普通历史，本次运行的记录仍可继续使用。' },
  { title: '常驻恢复会做什么？', answer: '启用后，每次外部复制或选择其他历史内容，会按设置的间隔重新计时，到期把第一条置顶内容放回剪贴板。默认关闭；启用后的默认间隔是 5 秒，可设为 1–3600 秒。关闭功能或移除最后一条置顶内容会取消等待。' },
  { title: '点击记录后，会直接粘贴吗？', answer: '在 Windows 上，点击记录会先写入剪贴板，再回到原来的输入窗口尝试粘贴。如果原窗口已关闭、焦点发生变化或系统限制自动粘贴，应用会提示你手动按 Ctrl + V。文件记录保存原文件引用，原文件需要仍然存在。' },
  { title: '支持哪些系统？', answer: '目前主要面向 Windows，提供当前用户安装方式。macOS 和 Linux 的集成仍在完善中，暂不提供同等功能支持。网页演示可在手机或其他系统上浏览，它不会读取设备剪贴板。' },
]

function GetApp() {
  const [copyState, setCopyState] = useState<'idle' | 'busy' | 'copied' | 'error'>('idle')

  async function copyCommand() {
    if (copyState === 'busy') return
    setCopyState('busy')
    try {
      await navigator.clipboard.writeText(buildCommand)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  return <section className="download-section section-shell" id="download" aria-labelledby="download-title">
    <img src={logo} className="download-logo" width={72} height={72} alt="" loading="lazy" />
    <p className="eyebrow">让复制，简单一点。</p>
    <h2 id="download-title">下一次复制，<br className="mobile-break" />就从这里开始。</h2>
    <p>把常用的留下，把刚才的找回。<br />让每一次复制，都有着落。</p>
    {downloadUrl ? <>
      <a className="button button-primary" href={downloadUrl}><WindowsMark />下载 Windows 版<ArrowDownToLine size={17} /></a>
      <p className="download-meta">Windows 桌面应用 · 安装后按 Win + V 开始使用</p>
    </> : <div className="build-guide">
      <div className="build-guide-heading"><span><WindowsMark />从源码构建 Windows 版</span><button className="copy-command" type="button" disabled={copyState === 'busy'} onClick={() => void copyCommand()}>
        {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}{copyState === 'copied' ? '已复制' : '复制命令'}
      </button></div>
      <p>在项目源码目录执行以下命令，生成 Windows 安装包。</p>
      <pre><code>{buildCommand}</code></pre>
      <p className="build-requirements">构建需要 Node.js 24、pnpm 11、Rust、MSVC C++ Build Tools 与 WebView2。</p>
      <p className="copy-status" role="status">{copyState === 'error' ? '无法自动复制，请选中上方命令手动复制。' : copyState === 'copied' ? '构建命令已复制到剪贴板。' : '正式安装包发布后，这里将提供下载入口。'}</p>
    </div>}
  </section>
}

export default function App() {
  return <>
    <a className="skip-link" href="#main">跳到主要内容</a>
    <header className="site-header section-shell" id="top">
      <Brand />
      <nav aria-label="主要导航"><a href="#features">功能</a><a href="#privacy">本机与隐私</a><a href="#faq">常见问题</a></nav>
      <a className="header-download" href="#download">获取 Windows 版<ArrowDownToLine size={15} /></a>
    </header>

    <main id="main">
      <section className="hero section-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="platform-label"><WindowsMark />为 Windows 工作日常而生</p>
          <h1 id="hero-title">把复制过的，<br /><span>留在手边。</span></h1>
          <p className="hero-description">刚复制的链接、顺手记的灵感、常用的那段话。<br className="desktop-break" />一个快捷键，就能找回来，接着用。</p>
          <div className="hero-actions"><a className="button button-primary" href="#download"><WindowsMark />获取 Windows 版<ArrowDownToLine size={17} /></a><a className="button button-text" href="#demo">先试一试<ArrowRight size={17} /></a></div>
          <p className="hero-reassurance"><span><Check size={13} />本机保存</span><span><Check size={13} />无需账号</span><span><Check size={13} />按习惯保留</span></p>
          <div className="shortcut-hint"><div className="shortcut-keys"><kbd><WindowsMark /><span className="sr-only">Win</span></kbd><span>+</span><kbd>V</kbd></div><p>熟悉的快捷键，<br /><strong>多一点得心应手。</strong></p></div>
        </div>
        <ClipboardDemo />
      </section>

      <section className="workflow section-shell" aria-label="使用步骤">
        <div className="workflow-intro"><Keyboard size={20} /><span>还是你熟悉的<br /><strong>复制与粘贴。</strong></span></div>
        <div className="workflow-step"><span className="step-number">01</span><div><h2>照常复制</h2><p>按 Ctrl + C，记录随手收好。</p></div></div>
        <ArrowRight className="step-arrow" size={18} />
        <div className="workflow-step"><span className="step-number">02</span><div><h2>唤出历史</h2><p>按 Win + V，找到需要的。</p></div></div>
        <ArrowRight className="step-arrow" size={18} />
        <div className="workflow-step"><span className="step-number">03</span><div><h2>接着使用</h2><p>点一下，把内容放回输入处。</p></div></div>
      </section>

      <section className="formats-section section-shell" id="features" aria-labelledby="formats-title">
        <div className="section-heading"><div><p className="eyebrow">工作里的零碎，都接得住。</p><h2 id="formats-title">不止文字，<br />还有刚才的每一份内容。</h2></div><p>文字、链接、富文本、图片和文件引用，<br className="desktop-break" />按你的需要选择收录，省去来回寻找。</p></div>
        <div className="formats-grid">{formats.map(({ label, detail, icon: Icon, className, sample }) => <article className="format-card" key={label}>
          <div className={'format-art ' + className} aria-hidden="true">{sample}</div><h3><Icon size={15} />{label}</h3><p>{detail}</p>
        </article>)}</div>
      </section>

      <section className="pin-section section-shell" aria-labelledby="pin-title">
        <figure className="pin-illustration"><div className="pin-illustration-label"><Pin size={14} />常用的，放在最前面。</div>
          <div className="saved-clip"><span>每次都要找的那段话</span><p>你好，附件是本次更新的提案，<br />有任何想法，随时和我交流。</p><Pin size={16} fill="currentColor" /></div>
          <div className="saved-clip second-clip"><span>项目资料</span><p><Folder size={17} />品牌资料 / 项目文档</p><Pin size={16} fill="currentColor" /></div>
          <figcaption><RotateCcw size={15} /><span>需要时开启常驻恢复，<br /><strong>让第一条置顶内容回到剪贴板。</strong></span></figcaption>
        </figure>
        <div className="pin-description"><p className="eyebrow">常用的值得一个固定位置。</p><h2 id="pin-title">留下常用的。<br /><span>清走临时的。</span></h2><p>给常用内容点一个图钉，下次就不用翻。<br />清除未置顶记录时，你留下的还在。</p><p>还可以开启常驻恢复，按设置的间隔，把第一条置顶内容重新放回剪贴板。默认关闭，由你决定。</p><a className="inline-link" href="#demo">在演示里试试置顶<ArrowRight size={16} /></a></div>
      </section>

      <section className="privacy-section section-shell" id="privacy" aria-labelledby="privacy-title"><div className="privacy-panel">
        <div className="privacy-heading"><div className="privacy-icon"><ShieldCheck size={30} strokeWidth={1.4} /></div><p className="eyebrow">你的内容，留给你自己。</p><h2 id="privacy-title">剪贴板里的日常，<br />安心留在本机。</h2><p>从收录到使用，都在自己的电脑里。<br />不需要注册账号，也无需配置云端同步。</p></div>
        <div className="privacy-points"><article><LockKeyhole size={21} /><div><h3>历史记录，加密保存</h3><p>持久化的剪贴板内容使用 AES-256-GCM 加密，主密钥保存在 Windows 凭据管理器。</p></div></article><article><Clipboard size={21} /><div><h3>保留多少，自己决定</h3><p>仅本次运行、只保留置顶、保留全部。默认只保留置顶，把选择权留给你。</p></div></article><article><ShieldCheck size={21} /><div><h3>尊重来源的隐私标记</h3><p>源应用标记为私密或临时的剪贴板内容，会跳过收录。</p></div></article></div>
      </div></section>

      <section className="faq-section section-shell" id="faq" aria-labelledby="faq-title"><div><p className="eyebrow">再了解一点。</p><h2 id="faq-title">你可能想问的。</h2><p>简单的工具，也把细节说清楚。</p><a className="inline-link" href="#download">开始使用<ArrowDown size={15} /></a></div><div className="faq-list">{questions.map(({ title, answer }) => <details key={title}><summary>{title}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>

      <GetApp />
    </main>

    <footer className="site-footer section-shell"><Brand footer /><p>{product.tagline}</p><a href="#top">回到顶部<ArrowRight size={14} /></a></footer>
  </>
}
