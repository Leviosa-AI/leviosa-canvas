/**
 * 편집기 버튼.
 *
 * 색은 **편집기 토큰(`le-*`)만** 쓴다. `bg-primary` · `text-primary-foreground` 는
 * 소비자 앱의 CSS 변수를 읽는 이름이고, leviosa-agency 는 `--color-primary-foreground`
 * 를 안 둔다. 그래서 글자색 클래스가 한 줄도 안 구워졌고, 글자가 본문
 * (`--color-fg: #1a1a1a`)을 물려받아 호출부가 덮은 배경(`bg-le-ink-900`, 같은 앱에서
 * `#1a1a1a`)과 정확히 같은 값이 됐다 — 다운로드 팝오버의 저장 버튼이 검은 판때기로
 * 보인 이유다.
 *
 * 테두리도 같다. 색 없는 `border` 는 currentColor 라, 글자색이 어두우면 테두리가
 * 통째로 먹으로 나온다. 색을 쓰는 자리마다 토큰을 적는다.
 */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-le-md text-sm font-le-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-le-ink-400 focus-visible:ring-le-ink-300/50 focus-visible:ring-[3px] aria-invalid:ring-le-danger-500/20 dark:aria-invalid:ring-le-danger-500/40 aria-invalid:border-le-danger-500",
  {
    variants: {
      variant: {
        default: "bg-le-ink-900 text-le-on-accent hover:bg-le-ink-900/90",
        destructive:
          "bg-le-danger-500 text-le-on-accent hover:bg-le-danger-500/90 focus-visible:ring-le-danger-500/20 dark:focus-visible:ring-le-danger-500/40 dark:bg-le-danger-500/60",
        outline:
          "border border-le-ink-200 bg-le-surface text-le-ink-900 shadow-xs hover:bg-le-ink-100 dark:bg-le-ink-100/30 dark:hover:bg-le-ink-100/50",
        secondary:
          "bg-le-ink-100 text-le-ink-900 hover:bg-le-ink-100/80",
        ghost:
          "hover:bg-le-ink-100 hover:text-le-ink-900 dark:hover:bg-le-ink-100/50",
        link: "text-le-ink-900 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-le-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-le-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-le-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-le-md [&_svg:not([class*='size-'])]:size-3",
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
