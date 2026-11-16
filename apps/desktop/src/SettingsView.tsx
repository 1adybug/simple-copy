import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Check, Clipboard, File, Image, Keyboard, Link, LoaderCircle, Monitor, Moon, RotateCcw, SlidersHorizontal, Sun, Type } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Feedback } from '@/components/app-controls'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { desktop, errorText, shortcutLabel, type Kind, type Retention, type ThemeMode, type useClipboard } from './native'

type ClipboardState = ReturnType<typeof useClipboard>

const formatOptions: { key: Kind; title: string; detail: string; icon: ReactNode }[] = [
  { key: 'text', title: '纯文本', detail: '普通文字、代码和数字', icon: <Type /> },
  { key: 'link', title: '链接', detail: 'HTTP 和 HTTPS 地址', icon: <Link /> },
  { key: 'richText', title: '富文本', detail: 'HTML 和 RTF 格式', icon: <Clipboard /> },
  { key: 'image', title: '图片', detail: '截图和复制的图像', icon: <Image /> },
  { key: 'files', title: '文件与文件夹', detail: '保留原文件引用', icon: <File /> },
]

const retentionOptions = [
  ['session', '仅本次运行', '退出后移除全部历史'],
  ['pinned', '只保留置顶', '常用内容在下次打开时仍可使用'],
  ['all', '保留全部', '普通历史和置顶都加密保存在本机'],
] as const

export default function SettingsView({ state }: { state: ClipboardState }) {
  const { snapshot, settings, savingSettings, save, flushSettings } = state
  const [delay, setDelay] = useState<string | null>(null)
  const [validation, setValidation] = useState<string | null>(null)
  const [confirmRetention, setConfirmRetention] = useState<Retention | null>(null)
  const [closeError, setCloseError] = useState<string | null>(null)
  const closing = useRef(false)
  const retentionFocus = useRef<HTMLButtonElement | null>(null)
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

  if (!settings || !snapshot) return <div className="settings-loading">
    <LoaderCircle className="animate-spin" aria-label="正在载入设置" />
    <Feedback error={closeError || state.error} />
  </div>

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
    <>
      <form className="settings-form" noValidate onSubmit={(event) => event.preventDefault()}>
        <SettingsSection id="preferences-heading" title="使用偏好" icon={<SlidersHorizontal />}>
          <ShortcutInput value={settings.shortcut} onChange={(shortcut) => void save({ shortcut })} />
          {snapshot.shortcutError && <Feedback error={snapshot.shortcutError} />}
          <fieldset className="settings-field">
            <legend id="theme-mode-heading">明暗模式</legend>
            <RadioGroup className="theme-options" orientation="horizontal" aria-labelledby="theme-mode-heading" aria-describedby="theme-mode-help" value={settings.themeMode}
              onValueChange={(value) => void save({ themeMode: value as ThemeMode })}>
              {([
                ['system', '跟随系统', <Monitor />],
                ['light', '浅色', <Sun />],
                ['dark', '深色', <Moon />],
              ] as const).map(([value, title, icon]) => (
                <RadioGroupItem key={value} value={value} variant="card" className="theme-choice">
                  {icon}<span>{title}</span>
                </RadioGroupItem>
              ))}
            </RadioGroup>
            <p id="theme-mode-help" className="field-help">强调色和透明效果始终跟随 Windows，明暗模式可单独选择。</p>
          </fieldset>
        </SettingsSection>
        <SettingsSection id="recording-heading" title="记录与保存" icon={<Clipboard />}>
          <fieldset className="settings-field">
            <legend>收录的内容类型</legend>
            <div className="format-options">
              {formatOptions.map((format) => (
                <Label key={format.key} htmlFor={'format-' + format.key} className="format-choice"
                  data-checked={settings.formats[format.key] || undefined} data-format={format.key}>
                  <span className="format-icon" aria-hidden="true">{format.icon}</span>
                  <span id={'format-title-' + format.key} className="format-title">{format.title}</span>
                  <Checkbox id={'format-' + format.key} checked={settings.formats[format.key]}
                    aria-labelledby={'format-title-' + format.key} aria-describedby={'format-detail-' + format.key}
                    onCheckedChange={(checked) => void save({ formats: { [format.key]: checked === true } })} />
                  <small id={'format-detail-' + format.key} className="format-detail">{format.detail}</small>
                </Label>
              ))}
            </div>
          </fieldset>
          <HistoryLimitInput value={settings.maxHistoryItems} onChange={(maxHistoryItems) => void save({ maxHistoryItems })} />
          <fieldset className="settings-field">
            <legend id="retention-heading">退出后保留</legend>
            <RadioGroup className="retention-options" orientation="vertical" aria-labelledby="retention-heading" value={settings.retention}
              onValueChange={(value) => {
                retentionFocus.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
                updateRetention(value as Retention)
              }}>
              {retentionOptions.map(([value, title, detail]) => (
                <RadioGroupItem key={value} value={value} variant="card" className="retention-choice"
                  aria-labelledby={'retention-title-' + value} aria-describedby={'retention-detail-' + value}>
                  <span className="choice-copy"><span id={'retention-title-' + value}>{title}</span>
                    <small id={'retention-detail-' + value}>{detail}</small></span>
                </RadioGroupItem>
              ))}
            </RadioGroup>
          </fieldset>
          {snapshot.storageStatus && <Feedback error={snapshot.storageStatus} />}
        </SettingsSection>
        <SettingsSection id="restore-heading" title="自动恢复" icon={<RotateCcw />}>
          <div className="setting-line restore-toggle">
            <Label htmlFor="restore-enabled" className="choice-copy"><span id="restore-label">常驻恢复</span>
              <small id="restore-help">复制其他内容后，恢复为第一条置顶内容</small></Label>
            <Switch id="restore-enabled" aria-labelledby="restore-label" aria-describedby="restore-help" checked={settings.restoreEnabled}
              disabled={!snapshot.capabilities.restoreAvailable} onCheckedChange={(checked) => void save({ restoreEnabled: checked })} />
          </div>
          <div className="settings-field">
            <div className="setting-line">
              <Label htmlFor="restore-delay">每次变化后等待</Label>
              <div className="quantity-input restore-quantity">
                <Input id="restore-delay" type="number" inputMode="numeric" min="1" max="3600" step="1"
                  value={delay ?? String(settings.restoreSeconds)} onChange={(event) => updateDelay(event.target.value)}
                  onBlur={() => { if (!validation) setDelay(null) }}
                  aria-invalid={!!validation} aria-describedby={validation ? 'restore-delay-unit delay-help delay-error' : 'restore-delay-unit delay-help'} />
                <span id="restore-delay-unit" aria-hidden="true">秒</span>
              </div>
            </div>
            <p id="delay-help" className="field-help">连续复制会重新计时。最近置顶的内容排在第一条。</p>
            {validation && <p id="delay-error" role="alert" className="field-error">{validation}</p>}
          </div>
          {!snapshot.capabilities.restoreAvailable && !snapshot.capabilities.message && <p className="field-help">当前平台暂不支持常驻恢复。</p>}
        </SettingsSection>
        {snapshot.capabilities.message && <Feedback message={snapshot.capabilities.message} />}
      </form>
      <footer className="settings-status" aria-label="设置保存状态">
        {closeError || state.error
          ? <Feedback error={closeError || state.error} onDismiss={() => { setCloseError(null); state.clearMessage() }} />
          : <p role="status">{savingSettings ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : state.message ? <Check aria-hidden="true" /> : <Check className="save-idle-icon" aria-hidden="true" />}
            <span>{savingSettings ? '正在保存设置…' : state.message || '更改会自动保存'}</span></p>}
      </footer>
      <AlertDialog open={confirmRetention !== null} onOpenChange={(open) => { if (!open) setConfirmRetention(null) }}>
        <AlertDialogContent className="settings-confirm" onCloseAutoFocus={(event) => {
          event.preventDefault()
          retentionFocus.current?.focus()
        }}>
          <AlertDialogHeader><AlertDialogTitle>更新历史保留方式？</AlertDialogTitle>
            <AlertDialogDescription>更改后会按新设置移除磁盘上的历史。本次运行中的记录可继续使用。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => {
            if (confirmRetention) void save({ retention: confirmRetention })
          }}>更改保留方式</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function SettingsSection({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="settings-panel" aria-labelledby={id}>
    <h2 id={id}><span aria-hidden="true">{icon}</span>{title}</h2>
    {children}
  </section>
}

function HistoryLimitInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [confirmLimit, setConfirmLimit] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const invalid = draft !== null && (!/^\d+$/.test(draft) || Number(draft) > 4294967295)

  function commit() {
    if (draft === null || invalid) return
    const next = Number(draft)
    setDraft(null)
    if (next === value) return
    if (next > 0 && (value === 0 || next < value)) setConfirmLimit(next)
    else onChange(next)
  }

  return <>
    <div className="settings-field">
      <div className="setting-line">
        <Label htmlFor="max-history-items">最多保存条数</Label>
        <div className="quantity-input">
          <Input ref={input} id="max-history-items" type="number" inputMode="numeric" min="0" max="4294967295" step="1"
            value={draft ?? String(value)} onChange={(event) => setDraft(event.target.value)} onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
            aria-invalid={invalid} aria-describedby={invalid ? 'history-limit-help history-limit-error' : 'history-limit-help'} />
          <span aria-hidden="true">条</span>
        </div>
      </div>
      <p id="history-limit-help" className="field-help">0 表示不限制条数，置顶内容不计入上限。超出时移除最早的未置顶记录。</p>
      {invalid && <p id="history-limit-error" role="alert" className="field-error">请输入 0–4294967295 之间的整数条数。</p>}
    </div>
    <AlertDialog open={confirmLimit !== null} onOpenChange={(open) => { if (!open) setConfirmLimit(null) }}>
      <AlertDialogContent className="settings-confirm" onCloseAutoFocus={(event) => { event.preventDefault(); input.current?.focus() }}>
        <AlertDialogHeader><AlertDialogTitle>减少历史保存条数？</AlertDialogTitle>
          <AlertDialogDescription>更改后最多保存 {confirmLimit} 条未置顶记录，超出的较早记录会立即从历史和磁盘中移除，无法恢复。置顶内容会保留。</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => {
          if (confirmLimit !== null) onChange(confirmLimit)
        }}>减少保存条数</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
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
    if (!recording || event.nativeEvent.isComposing) return
    if (event.key === 'Tab') { stopRecording(); return }
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
      <div className="setting-line">
        <span id="shortcut-label" className="shortcut-label"><Keyboard aria-hidden="true" />呼出快捷键</span>
        <Button type="button" variant="secondary" className="shortcut-recorder" aria-pressed={recording}
          aria-labelledby="shortcut-label shortcut-value" aria-describedby="shortcut-help"
          onClick={() => {
            setRecording(true)
            setError(null)
            void invoke('record_shortcut', { recording: true }).catch((reason: unknown) => {
              setError(errorText(reason))
              setRecording(false)
            })
          }} onKeyDown={record} onBlur={stopRecording}>
          <span id="shortcut-value">{recording ? '请按下快捷键…' : <span className="shortcut-keys">
            {shortcutLabel(value).split(' + ').map((key, index) => <kbd key={index}>{key}</kbd>)}
          </span>}</span>
        </Button>
      </div>
      <small id="shortcut-help" className={error ? 'field-error' : 'field-help'} role={error ? 'alert' : undefined}>
        {error || (recording ? '按 Esc 取消录入，按 Tab 离开' : '点击组合键，即可录入新的呼出快捷键')}
      </small>
    </div>
  )
}
