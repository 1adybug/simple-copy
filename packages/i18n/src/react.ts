import { useSyncExternalStore } from 'react'
import { getLocale, subscribeLocale, translate } from './index'

export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale)
  return { locale, t: translate.bind(null, locale) }
}
