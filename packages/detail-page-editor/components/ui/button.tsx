import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-dpe-md text-sm font-dpe-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-dpe-ink-400 focus-visible:ring-dpe-ink-300/50 focus-visible:ring-[3px] aria-invalid:ring-dpe-danger-500/20 dark:aria-invalid:ring-dpe-danger-500/40 aria-invalid:border-dpe-danger-500",
  {
    variants: {
      variant: {
        default: "bg-dpe-ink-900 text-dpe-on-accent hover:bg-dpe-ink-900/90",
        destructive:
          "bg-dpe-danger-500 text-dpe-on-accent hover:bg-dpe-danger-500/90 focus-visible:ring-dpe-danger-500/20 dark:focus-visible:ring-dpe-danger-500/40 dark:bg-dpe-danger-500/60",
        outline:
          "border bg-dpe-surface shadow-xs hover:bg-dpe-ink-100 hover:text-dpe-ink-900 dark:bg-dpe-ink-100/30 dark:border-dpe-ink-200 dark:hover:bg-dpe-ink-100/50",
        secondary:
          "bg-dpe-ink-100 text-dpe-ink-900 hover:bg-dpe-ink-100/80",
        ghost:
          "hover:bg-dpe-ink-100 hover:text-dpe-ink-900 dark:hover:bg-dpe-ink-100/50",
        link: "text-dpe-ink-900 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-dpe-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-dpe-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-dpe-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-dpe-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
