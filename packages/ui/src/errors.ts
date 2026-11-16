import { t } from '@simple-copy/i18n'

export function errorText(error: unknown): string {
  return typeof error === 'string' ? error : error instanceof Error ? error.message : t('operationError')
}
