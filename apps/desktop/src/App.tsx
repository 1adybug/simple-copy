import logo from '@simple-copy/brand/logo.svg'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  Clipboard, Copy, File, Image, Link, LoaderCircle, Minus,
  Pin, Settings2, Square, Trash2, Type, X,
} from 'lucide-react'
import {
  useEffect, useRef, useState,
  type ComponentProps, type KeyboardEvent, type ReactNode,
} from 'react'
import { BroomIcon } from '@/components/icons/broom-icon'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { desktop, errorText, shortcutLabel, useClipboard, type Clip, type Kind, type Retention } from './native'

const kindLabels: Record<Kind, string> = {
  text: '纯文本', link: '链接', richText: '富文本', image: '图片', files: '文件与文件夹',
}
type ClipboardState = ReturnType<typeof useClipboard>

export default function App() {
  const state = useClipboard()
  return new URLSearchParams(location.search).get('view') === 'settings'
    ? <SettingsView state={state} />
    : <HistoryView state={state} />
}

function IconButton({ label, children, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} {...props} onClick={props.onClick}>{children}</Button>
  )
}

function Feedback({ error, message, onDismiss }: {
  error?: string | null; message?: string | null; onDismiss?: () => void
}) {
  if (!error && !message) return null
  return (
    <div className={error ? 'feedback feedback-error' : 'feedback'} role={error ? 'alert' : 'status'}>
      <span>{error || message}</span>
      {onDismiss && <button type="button" aria-label="关闭提示" onClick={onDismiss}><X size={13} /></button>}
    </div>
  )
}

function HistoryView({ state }: { state: ClipboardState }) {
  const { snapshot, action, busy, clearMessage } = state
  const [confirmation, setConfirmation] = useState<Clip | 'clear' | null>(null)
  const [navigationError, setNavigationError] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const items = snapshot?.items ?? []
  const ordinaryCount = items.filter((item) => !item.pinned).length

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented
        && !document.querySelector('[data-slot="alert-dialog-content"]')) {
        void invoke('hide_history').catch(() => {})
      }
    }
    document.addEventListener('keydown', onKey)
    if (!desktop) return () => document.removeEventListener('keydown', onKey)
    const unlisten = listen('popup-opened', () => {
      clearMessage()
      list.current?.scrollTo({ top: 0 })
    })
    return () => {
      document.removeEventListener('keydown', onKey)
      void unlisten.then((stop) => stop())
    }
  }, [clearMessage])

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLButtonElement) || !event.target.classList.contains('clip-main')) return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('.clip-main') ?? [])
    const current = buttons.indexOf(event.target)
    const destination = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : Math.min(buttons.length - 1, Math.max(0, current + (event.key === 'ArrowDown' ? 1 : -1)))
    event.preventDefault()
    buttons[destination]?.focus()
  }

  return (
    <main className="app-window history-window">
      <header className="window-header">
        <div className="heading-row">
          <div className="window-heading" data-tauri-drag-region><img src={logo} width={24} height={24} alt="" draggable={false} /><h1>剪贴板</h1></div>
          <div className="header-actions">
            <IconButton label="清除未置顶" disabled={ordinaryCount === 0 || busy} onClick={() => setConfirmation('clear')}><BroomIcon /></IconButton>
            <IconButton label="设置" onClick={() => void invoke('open_settings').catch((error: unknown) => setNavigationError(errorText(error)))}><Settings2 /></IconButton>
            <IconButton label="收起" onClick={() => void invoke('hide_history').catch(() => {})}><X /></IconButton>
          </div>
        </div>
      </header>
      <div className="history-scroll">
        <div ref={list} className="history-list" role="list" aria-label="剪贴板历史" onKeyDown={navigate}>
          {items.map((clip) => (
            <ClipCard key={clip.id} clip={clip} busy={busy}
              onPaste={() => void action({ type: 'paste', id: clip.id })}
              onCopy={() => void action({ type: 'copy', id: clip.id })}
              onPin={() => void action({ type: 'pin', id: clip.id, pinned: !clip.pinned })}
              onDelete={() => setConfirmation(clip)}
            />
          ))}
          {items.length === 0 && (
            <div className="empty-state">
              {snapshot || !desktop ? <Clipboard size={30} strokeWidth={1.25} /> : <LoaderCircle className="animate-spin" size={24} />}
              <h2>{snapshot || !desktop ? '复制一点内容，从这里开始' : '正在连接剪贴板'}</h2>
              <p>文字、图片和文件会出现在这里</p>
              {snapshot && !snapshot.capabilities.background && (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void state.capture()}>收录当前剪贴板</Button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="history-feedback">
        <Feedback error={navigationError || state.error || snapshot?.error || snapshot?.shortcutError}
          message={state.message} onDismiss={navigationError || state.error || state.message
            ? () => { setNavigationError(null); state.clearMessage() } : undefined} />
      </div>
      <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null) }}>
        <AlertDialogContent className="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation === 'clear' ? '清除未置顶记录？' : '删除这条记录？'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation === 'clear' ? '将移除 ' + ordinaryCount + ' 条未置顶记录。置顶内容可继续使用。' : '这条内容会从历史中移除。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="danger-button" onClick={() => {
              if (confirmation === 'clear') void action({ type: 'clearUnpinned' })
              else if (confirmation) void action({ type: 'delete', id: confirmation.id })
            }}>{confirmation === 'clear' ? '清除记录' : '删除记录'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function ClipCard({ clip, busy, onPaste, onCopy, onPin, onDelete }: {
  clip: Clip; busy: boolean; onPaste: () => void; onCopy: () => void; onPin: () => void; onDelete: () => void
}) {
  return (
    <Card className="clip-card" role="listitem" data-pinned={clip.pinned || undefined}>
      <button className="clip-main" type="button" disabled={busy} onClick={onPaste}
        aria-label={'粘贴' + kindLabels[clip.kind] + (clip.text ? '，' + clip.text.slice(0, 60) : '')}>
        {clip.hasThumbnail ? <ClipImage id={clip.id} /> : (
          <div className="clip-text">
            {clip.kind === 'files' && <div className="file-label"><File size={15} />{clip.fileCount} 个文件或文件夹</div>}
            <span className="clip-text-lines">{clip.text || kindLabels[clip.kind]}</span>
          </div>
        )}
      </button>
      <div className="clip-actions">
        <IconButton label={clip.pinned ? '取消置顶' : '置顶'} disabled={busy} onClick={onPin}
          aria-pressed={clip.pinned} className="pin-button">
          <Pin strokeWidth={1.5} fill={clip.pinned ? 'currentColor' : 'none'} />
        </IconButton>
        <IconButton label="复制" disabled={busy} onClick={onCopy} className="clip-action-reveal">
          <Copy strokeWidth={1.5} />
        </IconButton>
        <IconButton label="删除" disabled={busy} onClick={onDelete} className="clip-action-reveal delete-button">
          <Trash2 strokeWidth={1.5} />
        </IconButton>
      </div>
    </Card>
  )
}

function ClipImage({ id }: { id: number }) {
  const [source, setSource] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let disposed = false
    let objectUrl: string | undefined
    void invoke<ArrayBuffer>('clipboard_thumbnail', { id }).then((bytes) => {
      if (disposed) return
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
      setSource(objectUrl)
    }).catch(() => { if (!disposed) setFailed(true) })
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [id])
  return source
    ? <img className="clip-image" src={source} alt="剪贴板图片预览" draggable={false} />
    : <span className="image-placeholder"><Image size={22} />{failed ? '图片预览暂不可用' : '正在读取图片'}</span>
}

const formatOptions: { key: Kind; title: string; detail: string; icon: ReactNode }[] = [
  { key: 'text', title: '纯文本', detail: '普通文字、代码和数字', icon: <Type /> },
  { key: 'link', title: '链接', detail: 'HTTP 和 HTTPS 地址', icon: <Link /> },
  { key: 'richText', title: '富文本', detail: 'HTML 和 RTF 格式', icon: <Clipboard /> },
  { key: 'image', title: '图片', detail: '截图和复制的图像', icon: <Image /> },
  { key: 'files', title: '文件与文件夹', detail: '保留原文件引用', icon: <File /> },
]

function SettingsHeader() {
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

function SettingsView({ state }: { state: ClipboardState }) {
  const { snapshot, settings, savingSettings, save, flushSettings } = state
  const [delay, setDelay] = useState<string | null>(null)
  const [validation, setValidation] = useState<string | null>(null)
  const [confirmRetention, setConfirmRetention] = useState<Retention | null>(null)
  const [closeError, setCloseError] = useState<string | null>(null)
  const closing = useRef(false)
  useEffect(() => {
    if (!desktop) return
    const window = getCurrentWindow()
    const stop = window.onCloseRequested((event) => {
      event.preventDefault()
      if (closing.current) return
      closing.current = true
      void flushSettings().then(async (saved) => {
        if (saved) await window.destroy()
      }).catch((reason: unknown) => setCloseError(errorText(reason)))
        .finally(() => { closing.current = false })
    })
    return () => { void stop.then((unlisten) => unlisten()) }
  }, [flushSettings])

  if (!settings || !snapshot) return <main className="app-window settings-window">
    <SettingsHeader />
    <div className="settings-loading"><LoaderCircle className="animate-spin" /><Feedback error={closeError || state.error} /></div>
  </main>

  function updateDelay(value: string) {
    setDelay(value)
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 3600) {
      setValidation('请输入 1–3600 之间的整数秒数。')
      return
    }
    setValidation(null)
    void save({ restoreSeconds: Number(value) })
  }
  function updateRetention(value: Retention) {
    if ((settings?.retention === 'all' && value !== 'all')
      || (settings?.retention === 'pinned' && value === 'session')) {
      setConfirmRetention(value)
    } else void save({ retention: value })
  }

  return (
    <main className="app-window settings-window">
      <SettingsHeader />
      <form className="settings-form" noValidate onSubmit={(event) => event.preventDefault()}>
        <section className="settings-section">
          <h2>打开剪贴板</h2>
          <ShortcutInput value={settings.shortcut} onChange={(shortcut) => void save({ shortcut })} />
          {snapshot.shortcutError && <Feedback error={snapshot.shortcutError} />}
        </section>
        <section className="settings-section">
          <h2>记录内容</h2>
          <div className="setting-card">
            {formatOptions.map((format) => (
              <div className="setting-row" key={format.key}>
                <div className="format-icon">{format.icon}</div>
                <Label htmlFor={'format-' + format.key} className="setting-copy">
                  <span>{format.title}</span><small>{format.detail}</small>
                </Label>
                <Switch id={'format-' + format.key} checked={settings.formats[format.key]}
                  onCheckedChange={(checked) => void save({ formats: { [format.key]: checked } })} />
              </div>
            ))}
          </div>
        </section>
        <section className="settings-section">
          <h2>退出后保留</h2>
          <RadioGroup value={settings.retention} onValueChange={(value) => updateRetention(value as Retention)}
            className="retention-options" aria-label="历史保留方式">
            {([
              ['session', '仅本次运行', '退出后移除全部历史'],
              ['pinned', '只保留置顶', '常用内容在下次打开时仍可使用'],
              ['all', '保留全部', '普通历史和置顶都加密保存在本机'],
            ] as const).map(([value, title, detail]) => (
              <Label key={value} className="retention-option" htmlFor={'retention-' + value}>
                <RadioGroupItem value={value} id={'retention-' + value} />
                <span className="setting-copy"><span>{title}</span><small>{detail}</small></span>
              </Label>
            ))}
          </RadioGroup>
          {snapshot.storageStatus && <Feedback error={snapshot.storageStatus} />}
        </section>
        <section className="settings-section">
          <div className="restore-heading">
            <div><h2><Label htmlFor="restore-enabled">常驻恢复</Label></h2><p>复制其他内容后，恢复为第一条置顶内容</p></div>
            <Switch id="restore-enabled" checked={settings.restoreEnabled} disabled={!snapshot.capabilities.restoreAvailable} onCheckedChange={(checked) => void save({ restoreEnabled: checked })} />
          </div>
          <div className="delay-row">
            <Label htmlFor="restore-delay">每次变化后等待</Label>
            <Input id="restore-delay" type="number" inputMode="numeric" min="1" max="3600" step="1"
              value={delay ?? String(settings.restoreSeconds)} onChange={(event) => updateDelay(event.target.value)}
              onBlur={() => { if (!validation) setDelay(null) }}
              aria-invalid={!!validation} aria-describedby={validation ? 'delay-help delay-error' : 'delay-help'} />
            <span>秒</span>
          </div>
          <p id="delay-help" className="field-help">连续复制会重新计时。最近置顶的内容排在第一条。</p>
          {validation && <p id="delay-error" role="alert" className="field-error">{validation}</p>}
        </section>
        {snapshot.capabilities.message && <Feedback message={snapshot.capabilities.message} />}
        <div className="settings-feedback">
          <Feedback error={closeError || state.error} message={savingSettings ? '正在保存设置…' : state.message}
            onDismiss={() => { setCloseError(null); state.clearMessage() }} />
        </div>
      </form>
      <AlertDialog open={confirmRetention !== null} onOpenChange={(open) => { if (!open) setConfirmRetention(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>更新历史保留方式？</AlertDialogTitle>
            <AlertDialogDescription>更改后会按新设置移除磁盘上的历史。本次运行中的记录可继续使用。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => {
            if (confirmRetention) void save({ retention: confirmRetention })
          }}>更改保留方式</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function ShortcutInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const change = useRef(onChange)
  change.current = onChange
  useEffect(() => {
    if (!desktop) return
    const unlisten = listen<string>('shortcut-recorded', ({ payload }) => {
      change.current(payload)
      setRecording(false)
      setError(null)
    })
    return () => {
      void unlisten.then((stop) => stop())
      void invoke('record_shortcut', { recording: false }).catch(() => {})
    }
  }, [])
  function stopRecording() {
    setRecording(false)
    void invoke('record_shortcut', { recording: false }).catch(() => {})
  }
  function record(event: KeyboardEvent<HTMLButtonElement>) {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') { stopRecording(); return }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return
    const modifiers = [
      event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super',
    ].filter(Boolean)
    if (!modifiers.length) { setError('请按下带修饰键的组合'); return }
    if (!/^Key[A-Z]$|^Digit[0-9]$|^F([1-9]|1[0-2])$/.test(event.code)) {
      setError('请选择字母、数字或 F1–F12')
      return
    }
    onChange([...modifiers, event.code].join('+'))
    stopRecording()
    setError(null)
  }
  return (
    <div className="shortcut-setting">
      <Button type="button" variant="secondary" className="shortcut-recorder" aria-pressed={recording}
        onClick={() => {
          setRecording(true)
          setError(null)
          void invoke('record_shortcut', { recording: true }).catch((reason: unknown) => {
            setError(errorText(reason))
            setRecording(false)
          })
        }} onKeyDown={record} onBlur={stopRecording}>
        {recording ? '请按下快捷键…' : shortcutLabel(value)}
      </Button>
      <small>{error || (recording ? '按 Esc 取消录入' : '点击后录入新的组合键')}</small>
    </div>
  )
}
