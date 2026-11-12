import { useLayoutEffect } from 'react'
import type { ThemeMode } from './native'

export function useTheme(mode: ThemeMode) {
  useLayoutEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = mode === 'system'
        ? systemTheme.matches ? 'dark' : 'light'
        : mode
    }
    apply()
    if (mode !== 'system') return
    systemTheme.addEventListener('change', apply)
    return () => systemTheme.removeEventListener('change', apply)
  }, [mode])
}
