import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useLayoutEffect, useState } from 'react'
import { desktop, type ThemeMode } from './native'
import { panelOpacity, systemPalette, type Rgb } from './system-palette'

export interface SystemAppearance {
  revision: number
  accentColor: Rgb | null
  transparency: boolean
}

export function useTheme(mode: ThemeMode) {
  const [appearance, setAppearance] = useState<SystemAppearance | null>(null)

  useEffect(() => {
    if (!desktop) return
    let disposed = false
    let unlisten: (() => void) | undefined
    const update = (next: SystemAppearance) => {
      if (!disposed) setAppearance((current) => !current || next.revision >= current.revision ? next : current)
    }
    // Listen before reading so changes during initialization cannot be missed. Revisions also
    // stop a delayed command response from overwriting a more recent native event.
    void listen<SystemAppearance>('system-appearance-changed', ({ payload }) => update(payload))
      .then(async (stop) => {
        if (disposed) { stop(); return }
        unlisten = stop
        update(await invoke<SystemAppearance>('system_appearance'))
      }).catch(() => { /* The shared solid palette remains available if native appearance is unavailable. */ })
    return () => { disposed = true; unlisten?.() }
  }, [])

  useLayoutEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
    const forcedColors = window.matchMedia('(forced-colors: active)')
    const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)')
    const root = document.documentElement
    let tokens: string[] = []
    const resetPalette = () => { for (const token of tokens) root.style.removeProperty(token); tokens = [] }
    const apply = () => {
      const theme = mode === 'system'
        ? systemTheme.matches ? 'dark' : 'light'
        : mode
      root.dataset.theme = theme
      root.style.setProperty('--sc-panel-opacity', `${panelOpacity * 100}%`)
      resetPalette()
      if (appearance?.accentColor && !forcedColors.matches) {
        const palette = systemPalette(appearance.accentColor, theme)
        for (const [token, value] of Object.entries(palette)) root.style.setProperty(token, value)
        tokens = Object.keys(palette)
      }
      root.dataset.transparency = String(!!appearance?.transparency && !forcedColors.matches && !reducedTransparency.matches)
    }
    apply()
    const preferences = [systemTheme, forcedColors, reducedTransparency]
    for (const preference of preferences) preference.addEventListener('change', apply)
    return () => {
      for (const preference of preferences) preference.removeEventListener('change', apply)
      resetPalette()
      root.style.removeProperty('--sc-panel-opacity')
      delete root.dataset.transparency
    }
  }, [mode, appearance])
}
