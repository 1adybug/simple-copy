import type { ComponentProps } from 'react'
import { ActionIcon } from './action-icon'

// The same pillowy contours and round 2.1-unit outlines as the history actions.
export function TextIcon(props: ComponentProps<'svg'>) {
  return <ActionIcon {...props}>
    <path d="M7.3 2.7c3.1-.5 6.3-.5 9.4 0 2.4.4 3.6 1.8 3.8 4.3.3 3.3.3 6.7 0 10-.2 2.5-1.4 3.9-3.8 4.3-3.1.5-6.3.5-9.4 0-2.4-.4-3.6-1.8-3.8-4.3-.3-3.3-.3-6.7 0-10 .2-2.5 1.4-3.9 3.8-4.3Z" />
    <path d="M8 8h8m-4 0v8m-2 0h4" />
  </ActionIcon>
}

export function LinkIcon(props: ComponentProps<'svg'>) {
  return <ActionIcon {...props}>
    <path d="m9.4 7.7 3.2-3.2c2.5-2.5 5.2-2.8 7.2-.8s1.7 4.7-.8 7.2l-3.2 3.2c-2 2-4.2 2.2-6 1" />
    <path d="m14.6 16.3-3.2 3.2c-2.5 2.5-5.2 2.8-7.2.8s-1.7-4.7.8-7.2l3.2-3.2c2-2 4.2-2.2 6-1" />
    <path d="m8.7 15.3 6.6-6.6" />
  </ActionIcon>
}

export function RichTextIcon(props: ComponentProps<'svg'>) {
  return <ActionIcon {...props}>
    <path d="M16.4 2.8c2.4.3 3.7 1.7 4 4.1.4 3.5.4 7.1 0 10.6-.3 2.4-1.6 3.8-4 4.1-2.9.4-5.9.4-8.8 0-2.4-.3-3.7-1.7-4-4.1-.4-3.5-.4-7.1 0-10.6.3-2.4 1.6-3.8 4-4.1" />
    <path d="M9.1 2c1.9-.2 3.9-.2 5.8 0 1.1.1 1.6.7 1.6 1.7s-.5 1.6-1.6 1.7c-1.9.2-3.9.2-5.8 0C8 5.3 7.5 4.7 7.5 3.7S8 2.1 9.1 2Z" />
    <path d="M8.2 10h7.6m-7.6 4h4.5m-4.5 3.5h6" />
  </ActionIcon>
}

export function ImageIcon(props: ComponentProps<'svg'>) {
  return <ActionIcon {...props}>
    <path d="M7 3.2c3.3-.4 6.7-.4 10 0 2.5.3 3.9 1.7 4.2 4.2.4 3.1.4 6.1 0 9.2-.3 2.5-1.7 3.9-4.2 4.2-3.3.4-6.7.4-10 0-2.5-.3-3.9-1.7-4.2-4.2-.4-3.1-.4-6.1 0-9.2C3.1 4.9 4.5 3.5 7 3.2Z" />
    <circle cx={8.1} cy={8.4} r={1.6} />
    <path d="m3 17.3 4.2-4.1c.9-.9 1.7-.9 2.6 0l2.3 2.2 3.4-3.7c.8-.9 1.6-1 2.5-.1l3.1 3.2" />
  </ActionIcon>
}

export function FilesIcon(props: ComponentProps<'svg'>) {
  return <ActionIcon {...props}>
    <path d="M2.8 10.2V7c0-2.5 1.2-3.8 3.6-3.9h2.4c1.1 0 1.8.4 2.5 1.3l1.2 1.5h4.7c2.7 0 4 1.3 4 3.9v.4" />
    <path d="M5.3 8.8c4.5-.4 8.9-.4 13.4 0 2 .2 3 1.3 2.9 3.3l-.6 5.4c-.2 2.4-1.5 3.7-3.9 3.9-3.4.3-6.8.3-10.2 0-2.4-.2-3.7-1.5-3.9-3.9l-.6-5.4c-.1-2 .9-3.1 2.9-3.3Z" />
    <path d="M8.9 15.3c.8 1 1.9 1.5 3.1 1.5s2.3-.5 3.1-1.5" />
  </ActionIcon>
}
