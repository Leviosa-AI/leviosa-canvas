"use client"

/**
 * 켬/끔 스위치. 켠 색은 `le-active-600`("켜져 있는 상태" 토큰), 끈 색은
 * `le-ink-300` 이다. shadcn 원본의 `bg-primary` · `bg-input` 은 소비자 앱의 이름이라
 * 그 앱이 안 두면 스위치가 통째로 투명해진다(select.tsx 주석 참고).
 */
import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer data-[state=checked]:bg-le-active-600 data-[state=unchecked]:bg-le-ink-300 focus-visible:border-le-select-500 focus-visible:ring-le-select-200 group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-le-surface pointer-events-none block rounded-full ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
