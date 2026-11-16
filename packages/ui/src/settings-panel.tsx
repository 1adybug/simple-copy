import { languageNames, supportedLocales, t, type Language } from '@simple-copy/i18n'
import { useI18n } from '@simple-copy/i18n/react'
import { Check, Clipboard, Keyboard, LoaderCircle, Monitor, Moon, RotateCcw, SlidersHorizontal, Sun } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Feedback } from './app-controls'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle,
} from './ui/alert-dialog'
import { FilesIcon, ImageIcon, LinkIcon, RichTextIcon, TextIcon } from './icons/content-type-icons'
import { DeleteIcon } from './icons/clip-action-icons'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { Select as SelectRoot, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Switch } from './ui/switch'
import { errorText } from './errors'
import { shortcutLabel } from './shortcuts'
import type { Kind, Retention, Settings, SettingsPatch, ThemeMode } from './types'

export interface ShortcutRecorder {
  start: () => Promise<void>
  stop: () => Promise<void>
  subscribe: (onRecorded: (shortcut: string) => void) => Promise<() => void>
}

export interface SettingsPanelState {
  settings: Settings | null
  snapshot: {
    shortcutError: string | null
    storageStatus: string | null
    capabilities: { restoreAvailable: boolean; message: string | null }
  } | null
  savingSettings: boolean
  save: (patch: SettingsPatch) => Promise<boolean>
  error: string | null
  message: string | null
  clearMessage: () => void
}

const formatOptions: { key: Kind; icon: ReactNode }[] = [
  { key: 'text', icon: <TextIcon /> },
  { key: 'link', icon: <LinkIcon /> },
  { key: 'richText', icon: <RichTextIcon /> },
  { key: 'image', icon: <ImageIcon /> },
  { key: 'files', icon: <FilesIcon /> },
]

const retentionOptions = [
  'session', 'pinned', 'all',
] as const

export function SettingsPanel({ state, shortcutRecorder }: {
  state: SettingsPanelState; shortcutRecorder?: ShortcutRecorder
}) {
  useI18n()
  const { snapshot, settings, savingSettings, save } = state
  const [delay, setDelay] = useState<string | null>(null)
  const [validation, setValidation] = useState<string | null>(null)
  const [confirmRetention, setConfirmRetention] = useState<Retention | null>(null)
  const retentionFocus = useRef<HTMLButtonElement | null>(null)

  if (!settings || !snapshot) return <div className="settings-loading">
    <LoaderCircle className="animate-spin" aria-label={t('loadingSettings')} />
    <Feedback error={state.error} />
  </div>

  function updateDelay(value: string) {
    setDelay(value)
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 3600) {
      setValidation(t('delayError'))
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
      <div className="settings-scroll">
        <form className="settings-form" noValidate onSubmit={(event) => event.preventDefault()}>
          <SettingsSection id="preferences-heading" title={t('preferences')} icon={<SlidersHorizontal />}>
            <ShortcutInput recorder={shortcutRecorder} value={settings.shortcut} onChange={(shortcut) => void save({ shortcut })} />
            {snapshot.shortcutError && <Feedback error={snapshot.shortcutError} />}
            <div className="setting-line language-setting">
              <Label htmlFor="language">{t('language')}</Label>
              <SelectRoot value={settings.language} onValueChange={(language) => void save({ language: language as Language })}>
                <SelectTrigger id="language"><SelectValue /></SelectTrigger>
                <SelectContent collisionPadding={16}>
                  <SelectItem value="system">{t('language.system')}</SelectItem>
                  {supportedLocales.map((locale) => <SelectItem key={locale} value={locale}><span lang={locale}>{languageNames[locale]}</span></SelectItem>)}
                </SelectContent>
              </SelectRoot>
            </div>
            <fieldset className="settings-field">
              <legend id="theme-mode-heading">{t('theme')}</legend>
              <RadioGroup className="theme-options" orientation="horizontal" aria-labelledby="theme-mode-heading" value={settings.themeMode}
                onValueChange={(value) => void save({ themeMode: value as ThemeMode })}>
                {([
                  ['system', t('theme.system'), <Monitor />],
                  ['light', t('theme.light'), <Sun />],
                  ['dark', t('theme.dark'), <Moon />],
                ] as const).map(([value, title, icon]) => (
                  <RadioGroupItem key={value} value={value} variant="card" className="theme-choice">
                    {icon}<span>{title}</span>
                  </RadioGroupItem>
                ))}
              </RadioGroup>
            </fieldset>
          </SettingsSection>
          <SettingsSection id="recording-heading" title={t('recording')} icon={<Clipboard />}>
            <fieldset className="settings-field">
              <legend>{t('recordFormats')}</legend>
              <div className="format-options">
                {formatOptions.map((format) => (
                  <Label key={format.key} htmlFor={'format-' + format.key} className="format-choice"
                    data-checked={settings.formats[format.key] || undefined} data-format={format.key}>
                    <span className="format-icon" aria-hidden="true">{format.icon}</span>
                    <span id={'format-title-' + format.key} className="format-title">{t(`format.${format.key}`)}</span>
                    <Checkbox id={'format-' + format.key} checked={settings.formats[format.key]}
                      aria-labelledby={'format-title-' + format.key} aria-describedby={'format-detail-' + format.key}
                      onCheckedChange={(checked) => void save({ formats: { [format.key]: checked === true } })} />
                    <small id={'format-detail-' + format.key} className="sr-only">{t(`formatDetail.${format.key}`)}</small>
                  </Label>
                ))}
              </div>
            </fieldset>
            <HistoryLimitInput value={settings.maxHistoryItems} onChange={(maxHistoryItems) => void save({ maxHistoryItems })} />
            <fieldset className="settings-field">
              <legend id="retention-heading">{t('retention')}</legend>
              <RadioGroup className="retention-options" orientation="horizontal" aria-labelledby="retention-heading" aria-describedby="retention-help" value={settings.retention}
                onValueChange={(value) => {
                  retentionFocus.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
                  updateRetention(value as Retention)
                }}>
                {retentionOptions.map((value) => (
                  <RadioGroupItem key={value} value={value} variant="card" className="retention-choice"
                    aria-labelledby={'retention-title-' + value} aria-describedby={'retention-detail-' + value}>
                    <span id={'retention-title-' + value}>{t(`retention.${value}`)}</span>
                    <small id={'retention-detail-' + value} className="sr-only">{t(`retentionDetail.${value}`)}</small>
                  </RadioGroupItem>
                ))}
              </RadioGroup>
              <p id="retention-help" className="field-help">{t(`retentionDetail.${settings.retention}`)}</p>
            </fieldset>
            {snapshot.storageStatus && <Feedback error={snapshot.storageStatus} />}
          </SettingsSection>
          <SettingsSection id="restore-heading" title={t('restore')} icon={<RotateCcw />}>
            <div className="setting-line restore-toggle">
              <Label htmlFor="restore-enabled" className="choice-copy"><span id="restore-label">{t('restoreEnabled')}</span>
                <small id="restore-help">{t('restoreHelp')}</small></Label>
              <Switch id="restore-enabled" aria-labelledby="restore-label" aria-describedby="restore-help" checked={settings.restoreEnabled}
                disabled={!snapshot.capabilities.restoreAvailable} onCheckedChange={(checked) => void save({ restoreEnabled: checked })} />
            </div>
            <div className="settings-field">
              <div className="setting-line">
                <Label htmlFor="restore-delay">{t('restoreDelay')}</Label>
                <div className="quantity-input restore-quantity">
                  <Input id="restore-delay" type="number" inputMode="numeric" min="1" max="3600" step="1"
                    value={delay ?? String(settings.restoreSeconds)} onChange={(event) => updateDelay(event.target.value)}
                    onBlur={() => { if (!validation) setDelay(null) }}
                    aria-invalid={!!validation} aria-describedby={validation ? 'restore-delay-unit delay-help delay-error' : 'restore-delay-unit delay-help'} />
                  <span id="restore-delay-unit" aria-hidden="true">{t('seconds')}</span>
                </div>
              </div>
              <p id="delay-help" className="field-help">{t('delayHelp')}</p>
              {validation && <p id="delay-error" role="alert" className="field-error">{validation}</p>}
            </div>
            {!snapshot.capabilities.restoreAvailable && !snapshot.capabilities.message && <p className="field-help">{t('restoreUnavailable')}</p>}
          </SettingsSection>
          {snapshot.capabilities.message && <Feedback message={snapshot.capabilities.message} />}
        </form>
      </div>
      <footer className="settings-status" aria-label={t('saveStatus')}>
        {state.error
          ? <Feedback error={state.error} onDismiss={state.clearMessage} />
          : <p role="status">{savingSettings ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : state.message ? <Check aria-hidden="true" /> : <Check className="save-idle-icon" aria-hidden="true" />}
            <span>{savingSettings ? t('saving') : state.message || t('autoSave')}</span></p>}
      </footer>
      <AlertDialog open={confirmRetention !== null} onOpenChange={(open) => { if (!open) setConfirmRetention(null) }}>
        <AlertDialogContent className="settings-confirm" onCloseAutoFocus={(event) => {
          event.preventDefault()
          retentionFocus.current?.focus()
        }}>
          <AlertDialogHeader><AlertDialogMedia tone="danger"><DeleteIcon /></AlertDialogMedia><AlertDialogTitle>{t('confirmRetention')}</AlertDialogTitle>
            <AlertDialogDescription>{t('retentionDescription')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t('cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => {
            if (confirmRetention) void save({ retention: confirmRetention })
          }}>{t('changeRetention')}</AlertDialogAction></AlertDialogFooter>
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
        <Label htmlFor="max-history-items">{t('maxHistory')}</Label>
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
          <span aria-hidden="true">{t('itemsUnit')}</span>
        </div>
      </div>
      <p id="history-limit-help" className="field-help">{t('maxHistoryHelp')}</p>
      {invalid && <p id="history-limit-error" role="alert" className="field-error">{t('maxHistoryError')}</p>}
    </div>
    <AlertDialog open={confirmLimit !== null} onOpenChange={(open) => { if (!open) setConfirmLimit(null) }}>
      <AlertDialogContent className="settings-confirm" onCloseAutoFocus={(event) => { event.preventDefault(); input.current?.focus() }}>
        <AlertDialogHeader><AlertDialogMedia tone="danger"><DeleteIcon /></AlertDialogMedia><AlertDialogTitle>{t('confirmLimit')}</AlertDialogTitle>
          <AlertDialogDescription>{t('limitDescription', { count: confirmLimit ?? 0 })}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{t('cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => {
          if (confirmLimit !== null) onChange(confirmLimit)
        }}>{t('reduceLimit')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}

function ShortcutInput({ value, onChange, recorder }: {
  value: string; onChange: (value: string) => void; recorder?: ShortcutRecorder
}) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const change = useRef(onChange)
  change.current = onChange
  useEffect(() => {
    if (!recorder) return
    const unlisten = recorder.subscribe((shortcut) => {
      change.current(shortcut)
      setRecording(false)
      setError(null)
    })
    return () => {
      void unlisten.then((stop) => stop())
      void recorder?.stop().catch(() => {})
    }
  }, [recorder])
  function stopRecording() {
    setRecording(false)
    void recorder?.stop().catch(() => {})
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
    if (!modifiers.length) { setError(t('shortcutModifier')); return }
    if (!/^Key[A-Z]$|^Digit[0-9]$|^F([1-9]|1[0-2])$/.test(event.code)) {
      setError(t('shortcutKey'))
      return
    }
    onChange([...modifiers, event.code].join('+'))
    stopRecording()
    setError(null)
  }
  return (
    <div className="shortcut-setting">
      <div className="setting-line">
        <span id="shortcut-label" className="shortcut-label"><Keyboard aria-hidden="true" />{t('shortcut')}</span>
        <Button type="button" variant="secondary" className="shortcut-recorder" aria-pressed={recording}
          aria-labelledby="shortcut-label shortcut-value" aria-describedby="shortcut-help"
          onClick={() => {
            setRecording(true)
            setError(null)
            void recorder?.start().catch((reason: unknown) => {
              setError(errorText(reason))
              setRecording(false)
            })
          }} onKeyDown={record} onBlur={stopRecording}>
          <span id="shortcut-value">{recording ? t('shortcutRecording') : <span className="shortcut-keys">
            {shortcutLabel(value).split(' + ').map((key, index) => <kbd key={index}>{key}</kbd>)}
          </span>}</span>
        </Button>
      </div>
      <small id="shortcut-help" className={error ? 'field-error' : 'field-help'} role={error ? 'alert' : undefined}>
        {error || (recording ? t('shortcutRecordingHelp') : t('shortcutHelp'))}
      </small>
    </div>
  )
}
