import * as React from "react"
import { cn } from "cn"
import { CircleIcon } from "lucide-react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  children,
  variant = "default",
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item> & { variant?: "default" | "card" }) {
  if (variant === "card") return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      data-variant="card"
      className={cn(
        "group/radio-card relative flex items-center gap-3 rounded-md border-0 bg-secondary p-3 text-left text-foreground transition-colors outline-none hover:bg-accent active:bg-control/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent",
        className
      )}
      {...props}
    >
      <span data-slot="radio-card-mark" aria-hidden="true" className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-control text-primary-foreground group-data-[state=checked]/radio-card:bg-primary">
        <RadioGroupPrimitive.Indicator><CircleIcon className="size-1.5 fill-current" /></RadioGroupPrimitive.Indicator>
      </span>
      {children}
    </RadioGroupPrimitive.Item>
  )
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "aspect-square size-4 shrink-0 rounded-full border-0 bg-control text-primary-foreground transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary hover:brightness-95 active:brightness-90 aria-invalid:bg-destructive",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
