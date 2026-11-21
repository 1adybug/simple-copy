import { t } from '@simple-copy/i18n'
import { useI18n } from '@simple-copy/i18n/react'
import { Clipboard, File, LoaderCircle, Search, X } from 'lucide-react'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref, type RefObject } from 'react'
import { Feedback, IconButton } from './app-controls'
import { useHistoryDrag } from './history-drag'
import { WindowFrame } from './window-frame'
import { BroomIcon } from './icons/broom-icon'
import { CopyIcon, DeleteIcon, PinIcon } from './icons/clip-action-icons'
import { CloseIcon, SettingsIcon } from './icons/window-action-icons'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle,
} from './ui/alert-dialog'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import type { Clip, HistoryAction, HistoryMove, Kind } from './types'

function kindLabel(kind: Kind) { return t(`format.${kind}`) }
function clipLabel(clip: Clip) { return clip.text.slice(0, 60) || kindLabel(clip.kind) }

const clipButtonSelector = '.clip-main:not(:disabled)'

export type HistoryNavigationKey = 'ArrowUp' | 'ArrowDown' | 'Home' | 'End' | 'Enter'

function nextClipIndex(key: Exclude<HistoryNavigationKey, 'Enter'>, current: number, count: number) {
  switch (key) {
    case 'Home': return 0
    case 'End': return count - 1
    case 'ArrowDown': return Math.min(count - 1, current + 1)
    case 'ArrowUp': return Math.max(0, current - 1)
  }
}

export interface HistoryPanelHandle {
  navigate: (key: HistoryNavigationKey, resetKey: number) => void
}

export interface HistoryPanelProps {
  items: readonly Clip[]
  busy?: boolean
  loading?: boolean
  error?: string | null
  message?: string | null
  resetKey?: number
  passive?: boolean
  listRef?: RefObject<HTMLDivElement | null>
  navigationRef?: Ref<HistoryPanelHandle>
  onAction: (action: HistoryAction) => void
  onOpenSettings: () => void
  onDismiss: () => void
  onCapture?: () => void
  onClearMessage?: () => void
  renderImage?: (clip: Clip) => ReactNode
}

export function HistoryPanel({
  items, busy = false, loading = false, error, message, resetKey, passive = false, listRef, navigationRef,
  onAction, onOpenSettings, onDismiss, onCapture, onClearMessage, renderImage,
}: HistoryPanelProps) {
  useI18n()
  const [confirmation, setConfirmation] = useState<Clip | 'clear' | null>(null)
  const confirmationFocus = useRef<HTMLButtonElement | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [moveStatus, setMoveStatus] = useState('')
  const pendingMove = useRef<{ action: HistoryMove; from: number; button?: HTMLButtonElement }>(null)
  const [selectionId, setSelectionId] = useState<number | null>(null)
  const latestSelectionId = useRef<number | null>(null)
  const [searchResetKey, setSearchResetKey] = useState(resetKey)
  const focusedResetKey = useRef<number | undefined>(undefined)
  if (searchResetKey !== resetKey) {
    setSearchResetKey(resetKey)
    setSearchValue('')
    setSearchQuery('')
    setConfirmation(null)
    setSelectionId(null)
    setMoveStatus('')
  }
  const search = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const localList = useRef<HTMLDivElement>(null)
  const list = listRef ?? localList
  const query = searchQuery.trim().toLowerCase()
  const filteredItems = query
    ? items.filter((clip) => clip.text.toLowerCase().includes(query) || kindLabel(clip.kind).toLowerCase().includes(query))
    : items
  const selectedClip = passive && !loading
    ? filteredItems.find((clip) => clip.id === selectionId) ?? filteredItems[0]
    : undefined
  const selectedId = selectedClip?.id
  const ordinaryCount = items.filter((item) => !item.pinned).length
  const visiblePinned = filteredItems.filter((clip) => clip.pinned).length

  function moveClip(action: HistoryMove, button?: HTMLButtonElement) {
    const group = items.filter((clip) => clip.pinned === action.pinned)
    pendingMove.current = { action, from: group.findIndex((clip) => clip.id === action.id), button }
    setMoveStatus('')
    onAction(action)
  }

  useHistoryDrag(list, JSON.stringify([resetKey, query, filteredItems.map(({ id, pinned }) => [id, pinned])]),
    !busy && !loading && !confirmation, moveClip, (id) => {
      const clip = filteredItems.find((item) => item.id === id)
      if (clip) setMoveStatus(t('history.grabbed', { text: clipLabel(clip) }))
    }, () => setMoveStatus(t('history.moveCancelled')))

  useLayoutEffect(() => {
    composing.current = false
    latestSelectionId.current = null
    pendingMove.current = null
  }, [resetKey])

  useLayoutEffect(() => {
    const pending = pendingMove.current
    if (!pending || busy) return
    pendingMove.current = null
    const { action, button, from } = pending
    if (button?.isConnected && (document.activeElement === document.body || document.activeElement === button)) {
      button.focus({ preventScroll: true })
      button.closest('.clip-card')?.scrollIntoView({ block: 'nearest' })
    }
    const group = items.filter((clip) => clip.pinned === action.pinned)
    const position = group.findIndex((clip) => clip.id === action.id)
    if (position >= 0 && position !== from && !error) {
      setMoveStatus(t('history.moved', { text: clipLabel(group[position]), position: position + 1 }))
    }
  })
  useLayoutEffect(() => { list.current?.scrollTo({ top: 0 }) }, [query, resetKey, list])
  useLayoutEffect(() => {
    if (resetKey === undefined || focusedResetKey.current === resetKey || loading || busy) return
    focusedResetKey.current = resetKey
    if (passive || confirmation || searchValue) return
    list.current?.querySelector<HTMLButtonElement>(clipButtonSelector)?.focus({ preventScroll: true })
  }, [busy, confirmation, list, loading, passive, resetKey, searchValue])

  useLayoutEffect(() => {
    if (selectedId === undefined || busy) return
    const button = list.current?.querySelector<HTMLButtonElement>('.clip-main[data-selected]')
    // Prepare the DOM focus for when the user enters the popup with Tab.
    button?.focus({ preventScroll: true })
    button?.closest('.clip-card')?.scrollIntoView({ block: 'nearest' })
  }, [busy, list, resetKey, selectedId])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing && !event.defaultPrevented
        && !document.querySelector('[data-slot="alert-dialog-content"]')) onDismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDismiss])

  useImperativeHandle(navigationRef, () => ({
    navigate(key, openKey) {
      if (!passive || openKey !== resetKey || confirmation || loading || busy || filteredItems.length === 0) return
      const current = Math.max(0, filteredItems.findIndex((clip) => clip.id === latestSelectionId.current))
      if (key === 'Enter') {
        onAction({ type: 'paste', id: filteredItems[current].id })
        return
      }
      const next = filteredItems[nextClipIndex(key, current, filteredItems.length)].id
      // Native key events can arrive in the same render batch.
      latestSelectionId.current = next
      setSelectionId(next)
    },
  }))

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.shiftKey
      || event.currentTarget.hasAttribute('data-dragging')) return
    if (!(event.target instanceof HTMLButtonElement) || !event.target.matches(clipButtonSelector)) return
    const { key } = event
    if (event.altKey) {
      if ((key !== 'ArrowUp' && key !== 'ArrowDown') || !event.target.hasAttribute('data-reorderable')) return
      event.preventDefault()
      const id = Number(event.target.closest<HTMLElement>('.clip-card')?.dataset.clipId)
      const clip = filteredItems.find((item) => item.id === id)
      if (!clip) return
      const group = filteredItems.filter((item) => item.pinned === clip.pinned)
      const direction = key === 'ArrowUp' ? -1 : 1
      const anchor = group[group.indexOf(clip) + direction]
      if (anchor) moveClip({ type: 'move', id, pinned: clip.pinned, anchor: anchor.id, position: direction < 0 ? 'before' : 'after' }, event.target)
      return
    }
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>(clipButtonSelector) ?? [])
    const current = buttons.indexOf(event.target)
    const destination = nextClipIndex(key, current, buttons.length)
    const button = buttons[destination]
    if (!button || current === destination) return
    event.preventDefault()
    button.focus({ preventScroll: true })
    button.closest('.clip-card')?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <WindowFrame title={t('appName')} view="history" actions={<>
      <IconButton label={t('clearUnpinned')} disabled={ordinaryCount === 0 || busy} onClick={(event) => {
        confirmationFocus.current = event.currentTarget
        setConfirmation('clear')
      }}><BroomIcon /></IconButton>
      <IconButton label={t('settings')} onClick={onOpenSettings}><SettingsIcon /></IconButton>
      <IconButton label={t('dismiss')} onClick={onDismiss}><CloseIcon /></IconButton>
    </>}>
      <search className="history-search" aria-label={t('search')}>
        <label htmlFor="history-query" className="sr-only">{t('search')}</label>
        <Search className="history-search-icon" size={15} aria-hidden="true" />
        <Input ref={search} id="history-query" className="history-search-input" type="search"
          placeholder={t('search')} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
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
            const first = list.current?.querySelector<HTMLButtonElement>(clipButtonSelector)
            if (!first) return
            event.preventDefault()
            first.focus({ preventScroll: true })
            first.closest('.clip-card')?.scrollIntoView({ block: 'nearest' })
          }} />
        {searchValue && <IconButton label={t('clearSearch')} className="history-search-clear" onClick={() => {
          composing.current = false
          setSearchValue('')
          setSearchQuery('')
          search.current?.focus()
        }}><X size={14} /></IconButton>}
      </search>
      <span className="sr-only" role="status">{query && t('searchResults', { count: filteredItems.length })}</span>
      <span className="sr-only" role="status">{moveStatus}</span>
      <span className="sr-only" id="history-move-hint">{t('history.moveHint')}</span>
      <div className="history-scroll">
        <div ref={list} id="clipboard-history" className="history-list" role="list" aria-label={t('history')} onKeyDown={navigate}>
          {filteredItems.map((clip) => (
            <ClipCard key={clip.id} clip={clip} busy={busy} selected={clip.id === selectedId} renderImage={renderImage}
              reorderable={(clip.pinned ? visiblePinned : filteredItems.length - visiblePinned) > 1}
              onPaste={() => onAction({ type: 'paste', id: clip.id })}
              onCopy={() => onAction({ type: 'copy', id: clip.id })}
              onPin={() => onAction({ type: 'pin', id: clip.id, pinned: !clip.pinned })}
              onDelete={(trigger) => { confirmationFocus.current = trigger; setConfirmation(clip) }}
            />
          ))}
          {items.length === 0 && (
            <div className="empty-state" role="listitem">
              {loading
                ? <LoaderCircle className="animate-spin" size={24} role="status" aria-label={t('connecting')} />
                : <Clipboard size={30} strokeWidth={1.25} role="img" aria-label={t('empty')} />}
              {onCapture && <Button variant="secondary" size="sm" disabled={busy} onClick={onCapture}>{t('capture')}</Button>}
            </div>
          )}
          {items.length > 0 && filteredItems.length === 0 && (
            <div className="empty-state" role="listitem">
              <Search size={30} strokeWidth={1.25} aria-hidden="true" />
              <h2>{t('noResults')}</h2>
              <p>{t('noResultsHelp')}</p>
            </div>
          )}
        </div>
      </div>
      <div className="window-feedback">
        <Feedback error={error} message={message} onDismiss={onClearMessage} />
      </div>
      <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null) }}>
        <AlertDialogContent className="confirm-dialog" onCloseAutoFocus={(event) => {
          event.preventDefault()
          const trigger = confirmationFocus.current
          if (trigger?.isConnected) trigger.focus()
          else search.current?.focus()
        }}>
          <AlertDialogHeader>
            <AlertDialogMedia tone="danger">{confirmation === 'clear' ? <BroomIcon /> : <DeleteIcon />}</AlertDialogMedia>
            <AlertDialogTitle>{confirmation === 'clear' ? t('confirmClear') : t('confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation === 'clear' ? t('clearDescription', { count: ordinaryCount }) : t('deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => {
              confirmationFocus.current = null
              if (confirmation === 'clear') onAction({ type: 'clearUnpinned' })
              else if (confirmation) onAction({ type: 'delete', id: confirmation.id })
            }}>{t('confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WindowFrame>
  )
}

function ClipCard({ clip, busy, selected, reorderable, onPaste, onCopy, onPin, onDelete, renderImage }: {
  clip: Clip; busy: boolean; selected: boolean; reorderable: boolean; onPaste: () => void; onCopy: () => void; onPin: () => void; onDelete: (trigger: HTMLButtonElement) => void
  renderImage?: (clip: Clip) => ReactNode
}) {
  return (
    <Card className="clip-card" role="listitem" data-clip-id={clip.id} data-pinned={clip.pinned || undefined} data-kind={clip.kind} data-thumbnail={clip.hasThumbnail || undefined}>
      <button className="clip-main" type="button" data-selected={selected || undefined} disabled={busy} onClick={onPaste}
        data-reorderable={reorderable || undefined} aria-describedby={reorderable ? 'history-move-hint' : undefined}
        aria-keyshortcuts={reorderable ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
        aria-label={t('pasteLabel', { kind: kindLabel(clip.kind), text: clip.text.slice(0, 60) })}>
        {clip.hasThumbnail && renderImage ? renderImage(clip) : (
          <div className="clip-text">
            {clip.kind === 'files' && <div className="file-label"><File size={15} />{t('fileCount', { count: clip.fileCount })}</div>}
            <span className="clip-text-lines">{clip.text || kindLabel(clip.kind)}</span>
          </div>
        )}
      </button>
      <div className="clip-actions">
        <IconButton label={clip.pinned ? t('unpin') : t('pin')} disabled={busy} onClick={onPin}
          aria-pressed={clip.pinned} className="pin-button">
          <PinIcon pinned={clip.pinned} />
        </IconButton>
        <IconButton label={t('copy')} disabled={busy} onClick={onCopy} className="clip-action-reveal"><CopyIcon /></IconButton>
        <IconButton label={t('delete')} disabled={busy} onClick={(event) => onDelete(event.currentTarget)} className="clip-action-reveal delete-button"><DeleteIcon /></IconButton>
      </div>
    </Card>
  )
}
