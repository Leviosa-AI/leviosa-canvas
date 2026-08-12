"use client";

import { Search } from "lucide-react";

/**
 * 좌측 패널의 검색창. 사진·아이콘·도형이 같은 것을 쓴다.
 *
 * 따로 빼 둔 이유가 둘이다.
 *
 *  1. **돋보기 자리.** 아이콘을 `absolute`로 얹으려면 기준 상자가 **입력칸과 정확히
 *     같아야** 한다. 바깥의 여백 있는 상자를 기준으로 삼으면 그 여백만큼 어긋나
 *     돋보기가 테두리에 걸린다(실제로 그렇게 보였다).
 *  2. **`appearance-none`.** 사파리는 `input[type=search]`를 OS 검색칸으로 그려서
 *     우리가 준 모서리·높이·안여백을 무시하고 알약 모양으로 만든다. 이걸 꺼야 세
 *     패널이 같은 모양이 된다.
 *
 * `type="search"`를 유지하는 것은 esc로 지우기·입력 도구 힌트 때문이다.
 */
export function PanelSearchInput({
  value,
  onChange,
  placeholder,
  label,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search
        aria-hidden="true"
        size={14}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="w-full appearance-none rounded-lg border border-neutral-200 py-2 pl-8 pr-2.5 text-sm leading-5 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
    </div>
  );
}
