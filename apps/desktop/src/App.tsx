import logo from '@simple-copy/brand/logo.svg'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Clipboard, Copy, File, LoaderCircle, Pin, Search, Settings2, Trash2, X } from 'lucide-react'
import { Component, lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Feedback, IconButton } from '@/components/app-controls'
import { ClipImage, useThumbnailVisibility } from '@/components/clip-image'
import { SettingsHeader } from '@/components/settings-header'
import { BroomIcon } from '@/components/icons/broom-icon'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { desktop, errorText, useClipboard, type Clip, type Kind } from './native'
import { useTheme } from './theme'

const SettingsView = lazy(() => import('./SettingsView'))
const kindLabels: Record<Kind, string> = {
  text: '纯文本', link: '链接', richText: '富文本', image: '图片', files: '文件与文件夹',
}
type ClipboardState = ReturnType<typeof useClipboard>

export default function App() {
  const state = useClipboard()
  const settingsWindow = new URLSearchParams(location.search).get('view') === 'settings'
  useTheme(state.snapshot?.settings.themeMode ?? 'system')
  useEffect(() => { document.title = settingsWindow ? '设置 · Simple Copy' : '剪贴板 · Simple Copy' }, [settingsWindow])
  return settingsWindow
    ? <main className="app-window settings-window">
      <SettingsHeader />
      <SettingsBoundary>
        <Suspense fallback={<div className="settings-loading" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" />正在载入设置</div>}>
          <SettingsView state={state} />
        </Suspense>
      </SettingsBoundary>
    </main>
    : <HistoryView state={state} />
}

class SettingsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <div className="settings-loading">
        <Feedback error="设置页面未能载入，请重新载入。" />
        <Button variant="secondary" onClick={() => location.reload()}>重新载入</Button>
      </div>
      : this.props.children
  }
}

function HistoryView({ state }: { state: ClipboardState }) {
  const { snapshot, action, busy, clearMessage } = state
  const [confirmation, setConfirmation] = useState<Clip | 'clear' | null>(null)
  const [navigationError, setNavigationError] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const list = useRef<HTMLDivElement>(null)
  const observeThumbnail = useThumbnailVisibility(list)
  const items = snapshot?.items ?? []
  const query = searchQuery.trim().toLowerCase()
  const filteredItems = query
    ? items.filter((clip) => clip.text.toLowerCase().includes(query) || kindLabels[clip.kind].includes(query))
    : items
  const ordinaryCount = items.filter((item) => !item.pinned).length

  useEffect(() => { list.current?.scrollTo({ top: 0 }) }, [query])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing && !event.defaultPrevented
        && !document.querySelector('[data-slot="alert-dialog-content"]')) {
        void invoke('hide_history').catch(() => {})
      }
    }
    document.addEventListener('keydown', onKey)
    if (!desktop) return () => document.removeEventListener('keydown', onKey)
    const unlisten = listen('popup-opened', () => {
      clearMessage()
      composing.current = false
      setSearchValue('')
      setSearchQuery('')
      list.current?.scrollTo({ top: 0 })
    })
    return () => {
      document.removeEventListener('keydown', onKey)
      void unlisten.then((stop) => stop())
    }
  }, [clearMessage])

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (!(event.target instanceof HTMLButtonElement) || !event.target.classList.contains('clip-main')) return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('.clip-main:not(:disabled)') ?? [])
    const current = buttons.indexOf(event.target)
    const destination = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : Math.min(buttons.length - 1, Math.max(0, current + (event.key === 'ArrowDown' ? 1 : -1)))
    if (current < 0 || destination === current) return
    event.preventDefault()
    buttons[destination]?.focus({ preventScroll: true })
    buttons[destination]?.closest('.clip-card')?.scrollIntoView({ block: 'nearest' })
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
      <search className="history-search" aria-label="搜索剪贴板">
        <label htmlFor="history-query" className="sr-only">搜索剪贴板</label>
        <Search className="history-search-icon" size={15} aria-hidden="true" />
        <Input ref={search} id="history-query" className="history-search-input" type="search"
          placeholder="搜索剪贴板" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
          aria-controls="clipboard-history" value={searchValue}
          onChange={(event) => {
            setSearchValue(event.target.value)
            if (!composing.current) setSearchQuery(event.target.value)
          }}
          onCompositionStart={() => { composing.current = true }}
          onCompositionEnd={(event) => {
            composing.current = false
            setSearchQuery(event.currentTarget.value)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' || event.nativeEvent.isComposing || composing.current
              || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
            const first = list.current?.querySelector<HTMLButtonElement>('.clip-main:not(:disabled)')
            if (!first) return
            event.preventDefault()
            first.focus({ preventScroll: true })
            first.closest('.clip-card')?.scrollIntoView({ block: 'nearest' })
          }} />
        {searchValue && <IconButton label="清空搜索" className="history-search-clear" onClick={() => {
          composing.current = false
          setSearchValue('')
          setSearchQuery('')
          search.current?.focus()
        }}><X size={14} /></IconButton>}
      </search>
      <span className="sr-only" role="status">{query && `找到 ${filteredItems.length} 条记录`}</span>
      <div className="history-scroll">
        <div ref={list} id="clipboard-history" className="history-list" role="list" aria-label="剪贴板历史" onKeyDown={navigate}>
          {filteredItems.map((clip) => (
            <ClipCard key={clip.id} clip={clip} busy={busy} observeThumbnail={observeThumbnail}
              onPaste={() => void action({ type: 'paste', id: clip.id })}
              onCopy={() => void action({ type: 'copy', id: clip.id })}
              onPin={() => void action({ type: 'pin', id: clip.id, pinned: !clip.pinned })}
              onDelete={() => setConfirmation(clip)}
            />
          ))}
          {items.length === 0 && (
            <div className="empty-state" role="listitem">
              {snapshot || !desktop ? <Clipboard size={30} strokeWidth={1.25} /> : <LoaderCircle className="animate-spin" size={24} />}
              <h2>{snapshot || !desktop ? '复制一点内容，从这里开始' : '正在连接剪贴板'}</h2>
              <p>文字、图片和文件会出现在这里</p>
              {snapshot && !snapshot.capabilities.background && (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void state.capture()}>收录当前剪贴板</Button>
              )}
            </div>
          )}
          {items.length > 0 && filteredItems.length === 0 && (
            <div className="empty-state" role="listitem">
              <Search size={30} strokeWidth={1.25} aria-hidden="true" />
              <h2>没有匹配的记录</h2>
              <p>换个关键词，或清空搜索试试</p>
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

function ClipCard({ clip, busy, onPaste, onCopy, onPin, onDelete, observeThumbnail }: {
  clip: Clip; busy: boolean; onPaste: () => void; onCopy: () => void; onPin: () => void; onDelete: () => void
  observeThumbnail: ReturnType<typeof useThumbnailVisibility>
}) {
  return (
    <Card className="clip-card" role="listitem" data-pinned={clip.pinned || undefined} data-kind={clip.kind} data-thumbnail={clip.hasThumbnail || undefined}>
      <button className="clip-main" type="button" disabled={busy} onClick={onPaste}
        aria-label={'粘贴' + kindLabels[clip.kind] + (clip.text ? '，' + clip.text.slice(0, 60) : '')}>
        {clip.hasThumbnail ? <ClipImage id={clip.id} observe={observeThumbnail} /> : (
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
