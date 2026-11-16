import { t } from '@simple-copy/i18n'
import { useI18n } from '@simple-copy/i18n/react'
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

function kindLabel(kind: Kind) { return t(`format.${kind}`) }

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
  useI18n()
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
    <WindowFrame title={t('clipboard')} view="history" actions={<>
      <IconButton label={t('clearUnpinned')} disabled={ordinaryCount === 0 || busy} onClick={() => setConfirmation('clear')}><BroomIcon /></IconButton>
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
            const first = list.current?.querySelector<HTMLButtonElement>('.clip-main:not(:disabled)')
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
      <div className="history-scroll">
        <div ref={list} id="clipboard-history" className="history-list" role="list" aria-label={t('history')} onKeyDown={navigate}>
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
        <AlertDialogContent className="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation === 'clear' ? t('confirmClear') : t('confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation === 'clear' ? t('clearDescription', { count: ordinaryCount }) : t('deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction className="danger-button" onClick={() => {
              if (confirmation === 'clear') onAction({ type: 'clearUnpinned' })
              else if (confirmation) onAction({ type: 'delete', id: confirmation.id })
            }}>{confirmation === 'clear' ? t('clearRecords') : t('deleteRecord')}</AlertDialogAction>
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
        <IconButton label={t('delete')} disabled={busy} onClick={onDelete} className="clip-action-reveal delete-button"><DeleteIcon /></IconButton>
      </div>
    </Card>
  )
}
