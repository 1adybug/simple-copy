import { expect, test } from '@playwright/test'
import { systemPalette, type Rgb } from '../../apps/desktop/src/system-palette'

function rgb(value: string): Rgb {
  return [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16)) as [number, number, number]
}

function contrast(first: Rgb, second: Rgb): number {
  const luminance = (color: Rgb) => color.reduce((sum, value, index) => {
    const channel = value / 255
    return sum + (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]!
  }, 0)
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const accents: Rgb[] = [
  [0, 120, 215], [16, 137, 62], [136, 23, 152], [232, 17, 35], [255, 185, 0],
  [0, 255, 255], [255, 0, 255], [0, 255, 0], [255, 255, 255], [0, 0, 0],
  [127, 127, 127], [254, 254, 254], [1, 1, 1],
]

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: system accent palettes preserve text and control contrast even at color extremes`, () => {
    for (const accent of accents) {
      const palette = systemPalette(accent, scheme)
      const color = (token: string) => rgb(palette[`--sc-${token}`]!)
      const panel = color('panel')
      const shell = panel.map((channel) => channel * 0.78 + (scheme === 'light' ? 0 : 255) * 0.22) as [number, number, number]
      const surfaces = ['card', 'panel', 'secondary', 'accent', 'hover', 'popover'].map(color).concat([shell])
      for (const surface of surfaces) {
        for (const token of ['foreground', 'primary', 'primary-hover', 'primary-active', 'muted', 'muted-on-fill']) {
          expect(contrast(color(token), surface), `${accent}: ${token} on ${surface}`).toBeGreaterThanOrEqual(4.5)
        }
        expect(contrast(color('control'), surface), `${accent}: control on ${surface}`).toBeGreaterThanOrEqual(3)
      }
      for (const fill of ['primary', 'primary-hover', 'primary-active']) {
        expect(contrast(color('primary-foreground'), color(fill)), `${accent}: label on ${fill}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
}
