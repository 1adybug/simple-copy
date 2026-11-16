import logo from '@simple-copy/brand/logo.svg'
import type { ReactNode } from 'react'

export function WindowFrame({ title, view, actions, children }: {
  title: string; view: 'history' | 'settings'; actions: ReactNode; children: ReactNode
}) {
  return (
    <main className={`app-window ${view}-window`}>
      <header className="window-header">
        <div className="heading-row">
          <div className="window-heading" data-tauri-drag-region>
            <img src={logo} width={24} height={24} alt="" draggable={false} />
            <h1>{title}</h1>
          </div>
          <div className="header-actions" role="group" aria-label="窗口操作">{actions}</div>
        </div>
      </header>
      {children}
    </main>
  )
}
