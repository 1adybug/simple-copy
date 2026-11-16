import { t } from '@simple-copy/i18n'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Button } from './ui/button'

export function IconButton({ label, children, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} {...props} onClick={props.onClick}>{children}</Button>
  )
}

export function Feedback({ error, message, onDismiss }: {
  error?: string | null; message?: string | null; onDismiss?: () => void
}) {
  if (!error && !message) return null
  return (
    <div className={error ? 'feedback feedback-error' : 'feedback'} role={error ? 'alert' : 'status'}>
      <span>{error || message}</span>
      {onDismiss && <button type="button" aria-label={t('closeFeedback')} onClick={onDismiss}><X size={13} /></button>}
    </div>
  )
}
