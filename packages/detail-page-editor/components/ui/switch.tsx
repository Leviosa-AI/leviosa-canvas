"use client"

/**
 * 켬/끔 스위치. 켠 색은 먹(`le-ink-900`), 끈 색은 `le-ink-300` 이다.
 *
 * 끈 색이 `ink-100` 이면 흰 패널(`le-surface`) 위에서 궤도가 거의 안 보인다 —
 * 손잡이도 흰색이고 테두리는 투명이라, 꺼진 스위치가 통째로 사라진다. 한 단계
 * 내려서 꺼짐이 꺼짐으로 읽히게 한다.
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
        "peer data-[state=checked]:bg-le-ink-900 data-[state=unchecked]:bg-le-ink-300 focus-visible:border-le-ink-400 focus-visible:ring-le-ink-300/50 dark:data-[state=unchecked]:bg-le-ink-100/80 group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-le-surface dark:data-[state=unchecked]:bg-le-ink-900 dark:data-[state=checked]:bg-le-on-accent pointer-events-none block rounded-full ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
