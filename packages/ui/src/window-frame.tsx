import { t } from '@simple-copy/i18n'
import logo from '@simple-copy/brand/logo.svg'
import type { ReactNode } from 'react'

export function WindowFrame({ title, view, actions, children }: {
  title: string; view: 'history' | 'settings'; actions: ReactNode; children: ReactNode
}) {
  return (
    <main className={`app-window ${view}-window`} aria-label={title}>
      <header className="window-header" data-tauri-drag-region>
        <div className="heading-row" data-tauri-drag-region>
          <div className="window-heading" data-tauri-drag-region>
            <img src={logo} width={24} height={24} alt="" draggable={false} />
            <h1>{title}</h1>
          </div>
          <div className="header-actions" data-tauri-drag-region role="group" aria-label={t('windowActions')}>{actions}</div>
        </div>
      </header>
      {children}
    </main>
  )
}
