import { Clipboard, File, LoaderCircle, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { Feedback, IconButton } from './app-controls'
import { WindowFrame } from './window-frame'
import { BroomIcon } from './icons/broom-icon'
import { CopyIcon, DeleteIcon, PinIcon } from './icons/clip-action-icons'
import { CloseIcon, SettingsIcon } from './icons/window-action-icons'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import type { Clip, HistoryAction, Kind } from './types'

function kindLabel(kind: Kind) { return ({ text: "纯文本", link: "链接", richText: "富文本", image: "图片", files: "文件与文件夹" })[kind] }

export interface HistoryPanelProps {
  items: readonly Clip[]
  busy?: boolean
  loading?: boolean
  error?: string | null
  message?: string | null
  resetKey?: number
  listRef?: RefObject<HTMLDivElement | null>
  onAction: (action: HistoryAction) => void
  onOpenSettings: () => void
  onDismiss: () => void
  onCapture?: () => void
  onClearMessage?: () => void
  renderImage?: (clip: Clip) => ReactNode
}

export function HistoryPanel({
  items, busy = false, loading = false, error, message, resetKey, listRef,
  onAction, onOpenSettings, onDismiss, onCapture, onClearMessage, renderImage,
}: HistoryPanelProps) {
  const [confirmation, setConfirmation] = useState<Clip | 'clear' | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const localList = useRef<HTMLDivElement>(null)
  const list = listRef ?? localList
  const query = searchQuery.trim().toLowerCase()
  const filteredItems = query
    ? items.filter((clip) => clip.text.toLowerCase().includes(query) || kindLabel(clip.kind).toLowerCase().includes(query))
    : items
  const ordinaryCount = items.filter((item) => !item.pinned).length

  useEffect(() => { list.current?.scrollTo({ top: 0 }) }, [query, list])

  useEffect(() => {
    composing.current = false
    setSearchValue('')
    setSearchQuery('')
    list.current?.scrollTo({ top: 0 })
  }, [resetKey, list])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing && !event.defaultPrevented
        && !document.querySelector('[data-slot="alert-dialog-content"]')) onDismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDismiss])

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
    <WindowFrame title={"剪贴板"} view="history" actions={<>
      <IconButton label={"清除未置顶"} disabled={ordinaryCount === 0 || busy} onClick={() => setConfirmation('clear')}><BroomIcon /></IconButton>
      <IconButton label={"设置"} onClick={onOpenSettings}><SettingsIcon /></IconButton>
      <IconButton label={"收起"} onClick={onDismiss}><CloseIcon /></IconButton>
    </>}>
      <search className="history-search" aria-label={"搜索剪贴板"}>
        <label htmlFor="history-query" className="sr-only">{"搜索剪贴板"}</label>
        <Search className="history-search-icon" size={15} aria-hidden="true" />
        <Input ref={search} id="history-query" className="history-search-input" type="search"
          placeholder={"搜索剪贴板"} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
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
        {searchValue && <IconButton label={"清空搜索"} className="history-search-clear" onClick={() => {
          composing.current = false
          setSearchValue('')
          setSearchQuery('')
          search.current?.focus()
        }}><X size={14} /></IconButton>}
      </search>
      <span className="sr-only" role="status">{query && ("找到 " + (filteredItems.length) + " 条记录")}</span>
      <div className="history-scroll">
        <div ref={list} id="clipboard-history" className="history-list" role="list" aria-label={"剪贴板历史"} onKeyDown={navigate}>
          {filteredItems.map((clip) => (
            <ClipCard key={clip.id} clip={clip} busy={busy} renderImage={renderImage}
              onPaste={() => onAction({ type: 'paste', id: clip.id })}
              onCopy={() => onAction({ type: 'copy', id: clip.id })}
              onPin={() => onAction({ type: 'pin', id: clip.id, pinned: !clip.pinned })}
              onDelete={() => setConfirmation(clip)}
            />
          ))}
          {items.length === 0 && (
            <div className="empty-state" role="listitem">
              {loading
                ? <LoaderCircle className="animate-spin" size={24} role="status" aria-label={"正在连接剪贴板"} />
                : <Clipboard size={30} strokeWidth={1.25} role="img" aria-label={"剪贴板为空"} />}
              {onCapture && <Button variant="secondary" size="sm" disabled={busy} onClick={onCapture}>{"收录当前剪贴板"}</Button>}
            </div>
          )}
          {items.length > 0 && filteredItems.length === 0 && (
            <div className="empty-state" role="listitem">
              <Search size={30} strokeWidth={1.25} aria-hidden="true" />
              <h2>{"没有匹配的记录"}</h2>
              <p>{"换个关键词，或清空搜索试试"}</p>
            </div>
          )}
        </div>
      </div>
      <div className="window-feedback">
        <Feedback error={error} message={message} onDismiss={onClearMessage} />
      </div>
      <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null) }}>
        <AlertDialogContent className="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation === 'clear' ? "清除未置顶记录？" : "删除这条记录？"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation === 'clear' ? ("将移除 " + (ordinaryCount) + " 条未置顶记录。置顶内容可继续使用。") : "这条内容会从历史中移除。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{"取消"}</AlertDialogCancel>
            <AlertDialogAction className="danger-button" onClick={() => {
              if (confirmation === 'clear') onAction({ type: 'clearUnpinned' })
              else if (confirmation) onAction({ type: 'delete', id: confirmation.id })
            }}>{confirmation === 'clear' ? "清除记录" : "删除记录"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WindowFrame>
  )
}

function ClipCard({ clip, busy, onPaste, onCopy, onPin, onDelete, renderImage }: {
  clip: Clip; busy: boolean; onPaste: () => void; onCopy: () => void; onPin: () => void; onDelete: () => void
  renderImage?: (clip: Clip) => ReactNode
}) {
  return (
    <Card className="clip-card" role="listitem" data-pinned={clip.pinned || undefined} data-kind={clip.kind} data-thumbnail={clip.hasThumbnail || undefined}>
      <button className="clip-main" type="button" disabled={busy} onClick={onPaste}
        aria-label={('粘贴' + kindLabel(clip.kind) + (clip.text ? '，' + clip.text.slice(0, 60) : ''))}>
        {clip.hasThumbnail && renderImage ? renderImage(clip) : (
          <div className="clip-text">
            {clip.kind === 'files' && <div className="file-label"><File size={15} />{("" + (clip.fileCount) + " 个文件或文件夹")}</div>}
            <span className="clip-text-lines">{clip.text || kindLabel(clip.kind)}</span>
          </div>
        )}
      </button>
      <div className="clip-actions">
        <IconButton label={clip.pinned ? "取消置顶" : "置顶"} disabled={busy} onClick={onPin}
          aria-pressed={clip.pinned} className="pin-button">
          <PinIcon pinned={clip.pinned} />
        </IconButton>
        <IconButton label={"复制"} disabled={busy} onClick={onCopy} className="clip-action-reveal"><CopyIcon /></IconButton>
        <IconButton label={"删除"} disabled={busy} onClick={onDelete} className="clip-action-reveal delete-button"><DeleteIcon /></IconButton>
      </div>
    </Card>
  )
}
