import en from '../locales/en.json' with { type: 'json' }
import zhCN from '../locales/zh-CN.json' with { type: 'json' }
import zhTW from '../locales/zh-TW.json' with { type: 'json' }
import ja from '../locales/ja.json' with { type: 'json' }
import ko from '../locales/ko.json' with { type: 'json' }
import de from '../locales/de.json' with { type: 'json' }
import fr from '../locales/fr.json' with { type: 'json' }
import es from '../locales/es.json' with { type: 'json' }
import pt from '../locales/pt.json' with { type: 'json' }
import ru from '../locales/ru.json' with { type: 'json' }

export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>
export const catalogs = { en, 'zh-CN': zhCN, 'zh-TW': zhTW, ja, ko, de, fr, es, pt, ru } satisfies Record<string, Messages>
export type Locale = keyof typeof catalogs
export const supportedLocales = Object.keys(catalogs) as Locale[]

// Match in preference order, with an explicit Chinese script taking precedence over region.
// Kept in parity with src-tauri/src/i18n.rs by the shared locale-cases.json fixture.
export function resolveLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const parts = language.trim().replaceAll('_', '-').toLowerCase().split('-')
    if (!/^[a-z]{2,3}$/.test(parts[0]) || parts.slice(1).some((part) => !/^[a-z0-9]{1,8}$/.test(part))) continue
    const base = parts[0]
    const extension = parts.findIndex((part, index) => index > 0 && part.length === 1)
    const subtags = parts.slice(1, extension < 0 ? undefined : extension)
    if (base === 'zh') {
      const script = subtags.find((part) => /^[a-z]{4}$/.test(part))
      if (script === 'hant') return 'zh-TW'
      if (script === 'hans') return 'zh-CN'
      if (script) continue
      return subtags.some((part) => ['tw', 'hk', 'mo'].includes(part)) ? 'zh-TW' : 'zh-CN'
    }
    if (Object.hasOwn(catalogs, base)) return base as Locale
  }
  return 'en'
}

let activeLocale: Locale = 'en'
const listeners = new Set<() => void>()

export function getLocale(): Locale { return activeLocale }
export function setLocale(locale: Locale) {
  activeLocale = locale
  document.documentElement.lang = locale
  document.documentElement.dir = 'ltr'
  for (const listener of listeners) listener()
}
export function subscribeLocale(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function translate(locale: Locale, key: MessageKey, values: Record<string, string | number> = {}): string {
  const template = catalogs[locale][key] || en[key]
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = values[name]
    return value === undefined ? placeholder : typeof value === 'number'
      ? new Intl.NumberFormat(locale, { useGrouping: false }).format(value) : value
  })
}

export function t(key: MessageKey, values?: Record<string, string | number>) {
  return translate(activeLocale, key, values)
}
