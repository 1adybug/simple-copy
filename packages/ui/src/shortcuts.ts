export function shortcutLabel(value: string): string {
  const mac = navigator.userAgent.includes('Mac')
  const labels: Record<string, string> = {
    Super: mac ? '⌘' : 'Win',
    Control: mac ? '⌃' : 'Ctrl',
    Alt: mac ? '⌥' : 'Alt',
    Shift: mac ? '⇧' : 'Shift',
  }
  return value.split('+').map((key) => labels[key] ?? key.replace(/^Key/, '').replace(/^Digit/, '')).join(mac ? ' ' : ' + ')
}
