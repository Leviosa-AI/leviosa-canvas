"use client";

// GIF 이펙트 픽커 — 폰트 픽커와 같은 방식(팝오버 + 실물 미리보기)으로 고른다.
//
// 원래는 <select> 였는데, "물결"·"흔들림"·"홀로그램 포일 (실버)" 같은 이름만 봐서는
// 뭐가 어떻게 움직이는지 알 수 없어 매번 크레딧을 써서 만들어 봐야 했다. 폰트 픽커가
// 글자 미리보기 WebP를 보여주듯, 여기서는 그 이펙트로 실제로 구운 GIF를 보여준다.
// 미리보기는 정적 자산이다(`public/gif-effect-previews/`, 소싱 저장소의
// `scripts/detail_page_gif_effect_previews.py` 로 굽는다) — 고르는 데 서버 호출이 없다.

import { useState } from "react";
import Image from "next/image";
import { Check, ChevronDown } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";

export type GifEffectOption = {
  id: string;
  label: string;
  /** 목록 아래에 띄울 한 줄 설명. */
  hint?: string;
  /** 있으면 이 라벨로 묶어서 보여준다(이미지 이펙트의 통짜/물체 구분). */
  group?: string;
  /** 미리보기 GIF 경로(`/gif-effect-previews/...`). */
  previewSrc: string;
};

export function GifEffectPicker({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  value: string;
  options: GifEffectOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const { t } = useTranslation("branding");
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  const label =
    ariaLabel ??
    t("detailPage.properties.gifEffectChoose", { defaultValue: "이펙트 고르기" });

  // 그룹 순서는 options 등장 순서를 따른다(카탈로그 순서 = 픽커 순서).
  const groups: Array<{ name: string; items: GifEffectOption[] }> = [];
  for (const option of options) {
    const name = option.group ?? "";
    const bucket = groups.find((entry) => entry.name === name);
    if (bucket) bucket.items.push(option);
    else groups.push({ name, items: [option] });
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          aria-expanded={open}
          className="flex min-w-0 items-center justify-between gap-2 rounded-le-md border border-le-ink-200 bg-le-surface px-2 py-1.5 text-left text-sm text-le-ink-900 outline-none hover:bg-le-ink-50 focus:border-le-ink-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="min-w-0 truncate">{selected?.label ?? value}</span>
          <ChevronDown
            aria-hidden="true"
            className="shrink-0 text-le-ink-400"
            size={14}
          />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="left"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[120] w-[300px] overflow-hidden rounded-le-lg border border-le-ink-200 bg-le-surface shadow-[0_10px_32px_rgba(0,0,0,0.14)]"
        >
          <div className="max-h-[420px] overflow-y-auto p-1">
            {groups.map((group) => (
              <div key={group.name || "default"}>
                {group.name ? (
                  <p className="px-2 pb-1 pt-2 text-[10px] font-le-semibold uppercase tracking-[0.06em] text-le-ink-400">
                    {group.name}
                  </p>
                ) : null}
                {group.items.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={option.id === value}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-le-md px-2 py-1.5 text-left hover:bg-le-ink-50"
                  >
                    <span className="flex h-12 w-[92px] shrink-0 items-center justify-center overflow-hidden rounded border border-le-ink-100 bg-le-ink-50">
                      {/* 미리보기는 움직여야 의미가 있다 — 최적화(정지 프레임 변환)를 끈다. */}
                      <Image
                        src={option.previewSrc}
                        alt={option.label}
                        width={184}
                        height={96}
                        className="h-full w-auto object-contain"
                        unoptimized
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-le-ink-900">
                        {option.label}
                      </span>
                      {option.hint ? (
                        <span className="mt-0.5 block text-[11px] leading-4 text-le-ink-400">
                          {option.hint}
                        </span>
                      ) : null}
                    </span>
                    {option.id === value ? (
                      <Check aria-hidden="true" className="shrink-0" size={15} />
                    ) : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <PopoverPrimitive.Arrow className="fill-le-on-accent" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
