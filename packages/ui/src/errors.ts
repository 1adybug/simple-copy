export function errorText(error: unknown): string {
  return typeof error === 'string' ? error : error instanceof Error ? error.message : '操作未完成，请重试。'
}
