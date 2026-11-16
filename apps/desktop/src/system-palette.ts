export type Rgb = readonly [number, number, number]
export type ColorScheme = 'light' | 'dark'
export const panelOpacity = 0.78

const white: Rgb = [255, 255, 255]
const black: Rgb = [0, 0, 0]

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  const channel = (index: 0 | 1 | 2) => Math.round(from[index] + (to[index] - from[index]) * amount)
  return [channel(0), channel(1), channel(2)]
}

function luminance(color: Rgb): number {
  const linear = color.map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
}

function contrast(first: Rgb, second: Rgb): number {
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// Generate an accent shade against all of its actual surfaces, including selected controls.
function readable(color: Rgb, surfaces: Rgb[], scheme: ColorScheme, ratio = 4.5): Rgb {
  const target = scheme === 'light' ? black : white
  for (let step = 0; step <= 100; step++) {
    const shade = mix(color, target, step / 100)
    if (surfaces.every((surface) => contrast(shade, surface) >= ratio)) return shade
  }
  return target
}

function css(color: Rgb): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export function systemPalette(accent: Rgb, scheme: ColorScheme): Record<string, string> {
  const light = scheme === 'light'
  const base: Rgb = light ? white : [24, 24, 24]
  const card = mix(light ? white : [44, 44, 44], accent, light ? 0 : 0.04)
  const panel = mix(base, accent, 0.10)
  const secondary = mix(light ? white : [44, 44, 44], accent, 0.12)
  const selected = mix(light ? white : [44, 44, 44], accent, 0.20)
  const hover = mix(light ? white : [48, 48, 48], accent, 0.07)
  const popover = mix(light ? white : [40, 40, 40], accent, 0.10)
  // Text on the translucent shell must also work over the most contrasting desktop behind it.
  const behind = light ? 0 : 255
  const shell: Rgb = [
    panel[0] * panelOpacity + behind * (1 - panelOpacity),
    panel[1] * panelOpacity + behind * (1 - panelOpacity),
    panel[2] * panelOpacity + behind * (1 - panelOpacity),
  ]
  const surfaces = [card, panel, shell, secondary, selected, hover, popover]
  const primary = readable(accent, surfaces, scheme)
  const primaryHover = readable(mix(primary, light ? black : white, 0.12), surfaces, scheme)
  const primaryActive = readable(mix(primary, light ? black : white, 0.24), surfaces, scheme)
  const foreground: Rgb = light ? [27, 27, 27] : [245, 245, 245]
  const muted = readable(mix(foreground, panel, 0.30), surfaces, scheme)
  const control = readable(mix(primary, panel, 0.30), surfaces, scheme, 3)
  const onPrimary = [primary, primaryHover, primaryActive].every((fill) => contrast(white, fill) >= 4.5) ? white : black

  return Object.fromEntries(Object.entries({
    '--sc-primary': primary,
    '--sc-primary-hover': primaryHover,
    '--sc-primary-active': primaryActive,
    '--sc-primary-foreground': onPrimary,
    '--sc-background': mix(base, accent, 0.04),
    '--sc-panel': panel,
    '--sc-foreground': foreground,
    '--sc-card': card,
    '--sc-popover': popover,
    '--sc-secondary': secondary,
    '--sc-accent': selected,
    '--sc-hover': hover,
    '--sc-control': control,
    '--sc-muted': muted,
    '--sc-muted-on-fill': muted,
    '--sc-header-icon': muted,
    '--sc-menu-icon': muted,
    '--sc-pin': muted,
    '--sc-pin-active': primary,
    '--sc-file-label': primary,
    '--sc-format-icon': muted,
    '--sc-empty-icon': muted,
    '--sc-empty-title': foreground,
    '--sc-empty-description': muted,
    '--sc-feedback-foreground': primary,
  }).map(([token, color]) => [token, css(color)]))
}
