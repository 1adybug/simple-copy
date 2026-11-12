import type { ComponentProps } from 'react'

export function BroomIcon(props: ComponentProps<'svg'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M12.4 9.7 18.7 2.5c.6-.7 1.6-.7 2.2-.1.6.6.7 1.5.1 2.2l-6.3 7.3" />
      <path d="M10.6 9.5c.5-.5 1.1-.5 1.7-.1l3.3 2.7c.6.5.7 1.2.3 1.8l-.9 1.2-5.4-4.3 1-1.3Z" />
      <path d="M9.6 10.8c-3.4.7-6.1 2.9-7.3 6.1-.3.8-.1 1.4.6 2 2.5 2.1 5.7 3.6 8.6 3 2.1-1.3 3.3-3.8 3.5-6.8" />
      <path d="M6.1 20.9c.5-2.2 1.7-4.3 3.2-6M9.5 21.8c.5-1.8 1.3-3.5 2.4-5" />
    </svg>
  )
}
