import type { ComponentProps } from 'react'
import { ActionIcon } from './action-icon'

export function BroomIcon(props: ComponentProps<'svg'>) {
  return (
    <ActionIcon {...props}>
      <path d="m13.1 10.7 6.7-7.8" />
      <path d="M10.6 9.6c.6-.6 1.3-.7 2-.2l3.2 2.7c.6.5.8 1.2.4 1.9l-.7 1.1" />
      <path d="M10.1 11.1c-3.4.7-6 2.8-7.2 5.9-.4 1-.1 1.8.7 2.4 2.4 1.8 5.5 3 8 2.3 2-1.5 3.1-3.8 3.2-6.6l-4.7-4Z" />
      <path d="M6.3 20.8c.5-1.9 1.5-3.7 2.9-5.1m.5 6.2c.4-1.4 1-2.8 1.9-4" />
    </ActionIcon>
  )
}
