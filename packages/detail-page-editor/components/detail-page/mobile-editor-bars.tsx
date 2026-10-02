// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
"use client";

/**
 * 좁은 화면(폰)의 하단 띠 — 좌측 레일과 우측 인스펙터가 들어갈 자리가 없어서 둘 다
 * 화면 아래 한 줄로 내린다(Canva 모바일과 같은 모양).
 *
 * - 아무것도 안 골랐으면 좌측 레일의 탭을 가로로 흘린다. 누르면 패널이 아래에서
 *   올라오는 시트로 열린다.
 * - 뭔가 골랐으면 인스펙터의 섹션(`Section` 제목)을 탭으로 세운다. 누르면 그 섹션
 *   하나만 띠 바로 위에 뜬다.
 *
 * 인스펙터를 섹션별로 다시 짜지 않는다. 인스펙터를 통째로 그려 두고, `Section` 이 다는
 * `data-le-section` 을 읽어 탭을 세우고 고른 것 하나만 CSS 로 보인다 — 인스펙터가 늘어도
 * 여기는 안 고친다.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import { Check } from "lucide-react";

import { observer } from "./canvas-observer";
import { selectedElementsDeep } from "./detail-page-selection";

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeMobile(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

type MobileSection = {
  name: string;
  Tab: (props: Record<string, unknown>) => ReactElement | null;
  Panel: (props: { store: unknown }) => ReactElement | null;
  visibleInList?: boolean;
};

type StoreLike = {
  pages: { children: { id: string }[] }[];
  openedSidePanel: string;
  openSidePanel: (name: string) => void;
  selectElements: (ids: string[]) => void;
};

const BAR_CLASS =
  "flex shrink-0 items-stretch border-t border-le-ink-200 bg-le-surface pb-[env(safe-area-inset-bottom)]";

// 레일 탭은 세로 레일 폭을 채우게 짜여 있다 — 가로로 흘릴 때는 칸 폭을 못 박고,
// 브랜드 구역 앞에 긋는 가로 구분선은 숨긴다.
const SHEET_CSS = `
[data-le-mobile-tabs] > div > span[aria-hidden="true"] { display: none; }
[data-le-mobile-tabs] > div > button { padding: 10px 4px !important; font-size: 11px !important; }
@keyframes le-sheet-up { from { transform: translateY(100%); } to { transform: none; } }
@keyframes le-fade-in { from { opacity: 0; } to { opacity: 1; } }
`;

/** 아무것도 안 골랐을 때 — 좌측 레일 탭 띠 + 아래서 올라오는 시트. */
const SectionBar = observer(function SectionBar({
  store,
  sections,
}: {
  store: unknown;
  sections: ReadonlyArray<MobileSection>;
}) {
  const s = store as StoreLike;
  const opened = s.openedSidePanel;
  const Panel = sections.find((section) => section.name === opened)?.Panel;
  const close = () => s.openSidePanel("");
  // 시트에서 뭔가 넣으면 시트를 닫고 넣은 것을 고른다 — 폰에서는 시트가 캔버스를 가리고
  // 있어서, 안 그러면 뭐가 들어갔는지 안 보인다. 하단 띠도 그걸로 인스펙터로 넘어간다.
  // (편집기의 `addElement` 는 선택을 안 옮긴다 — store.ts.)
  const ids = s.pages.flatMap((page) => page.children.map((el) => el.id));
  // 화면을 넣거나 복제한 것(페이지 패널)은 요소를 넣은 것이 아니다 — 화면 수가 바뀌면
  // 기준만 새로 잡는다.
  const pageCount = s.pages.length;
  const seen = useRef<{ ids: Set<string>; pages: number } | null>(null);
  useEffect(() => {
    if (!Panel) {
      seen.current = null;
      return;
    }
    if (!seen.current || seen.current.pages !== pageCount) {
      seen.current = { ids: new Set(ids), pages: pageCount };
      return;
    }
    const known = seen.current.ids;
    const added = ids.filter((id) => !known.has(id));
    if (added.length) {
      s.openSidePanel("");
      s.selectElements(added);
    }
  });

  // 시트는 띠 위에서 멈춘다 — 띠가 보여야 다른 탭으로 바로 옮겨 간다(Canva 와 같다).
  const navRef = useRef<HTMLElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  useLayoutEffect(() => {
    if (Panel) setBarHeight(navRef.current?.offsetHeight ?? 0);
  }, [Panel]);

  return (
    <>
      <style>{SHEET_CSS}</style>
      <nav
        ref={navRef}
        data-le-part="mobile-section-bar"
        data-le-mobile-tabs=""
        className={`${BAR_CLASS} overflow-x-auto`}
      >
        {sections
          .filter((section) => section.visibleInList !== false)
          .map(({ name, Tab }) => (
            <div key={name} className="w-[72px] shrink-0">
              <Tab
                active={name === opened}
                onClick={() => s.openSidePanel(name === opened ? "" : name)}
              />
            </div>
          ))}
      </nav>
      {Panel ? (
        <div
          className="fixed inset-x-0 top-0 z-40"
          style={{ bottom: barHeight }}
          data-le-part="mobile-sheet"
        >
          <div
            className="absolute inset-0 bg-black/30"
            style={{ animation: "le-fade-in 160ms ease-out" }}
            onClick={close}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 flex h-[75%] flex-col overflow-hidden rounded-t-2xl bg-le-surface shadow-2xl"
            style={{ animation: "le-sheet-up 220ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
          >
            {/* ponytail: 손잡이는 누르면 닫힌다 — 끌어내려 닫기는 바라면 붙인다. */}
            <button
              type="button"
              onClick={close}
              aria-label="close"
              className="flex h-6 shrink-0 items-center justify-center"
            >
              <span className="h-1 w-10 rounded-full bg-le-ink-300" />
            </button>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <Panel store={store} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
});

/** 뭔가 골랐을 때 — 인스펙터 섹션 탭 띠 + 띠 바로 위에 뜨는 섹션 하나. */
function InspectorBar({ store, inspector }: { store: unknown; inspector: ReactNode }) {
  const s = store as StoreLike;
  const hostRef = useRef<HTMLDivElement>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);

  // 인스펙터가 지금 그린 섹션 제목을 읽는다. 선택이 바뀌면 섹션도 바뀐다.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const read = () => {
      const next = [
        ...new Set(
          Array.from(host.querySelectorAll<HTMLElement>("[data-le-section]"), (el) =>
            el.getAttribute("data-le-section") ?? "",
          ),
        ),
      ];
      setTitles((prev) => (prev.join("\n") === next.join("\n") ? prev : next));
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(host, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  const shown = active !== null && titles.includes(active) ? active : null;

  return (
    <div className="relative shrink-0" data-le-part="mobile-inspector-bar">
      <style>{`
[data-le-mobile-inspector] [data-le-inspector-header] { display: none; }
[data-le-mobile-inspector] [data-le-section]:not([data-le-section="${shown ? CSS.escape(shown) : ""}"]) { display: none; }
[data-le-mobile-inspector] [data-le-section] { border-top: 0; }
`}</style>
      <div
        ref={hostRef}
        data-le-mobile-inspector=""
        className="absolute inset-x-2 bottom-full z-50 mb-2 max-h-[45dvh] overflow-y-auto rounded-xl border border-le-ink-200 bg-le-surface shadow-lg"
        style={{ display: shown ? undefined : "none" }}
      >
        {inspector}
      </div>
      <div className={BAR_CLASS}>
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {titles.map((title) => (
            <button
              key={title}
              type="button"
              aria-pressed={title === shown}
              onClick={() => setActive(title === shown ? null : title)}
              className={`shrink-0 whitespace-nowrap px-3.5 py-3.5 text-xs font-le-medium ${
                title === shown ? "bg-le-ink-100 text-le-ink-950" : "text-le-ink-600"
              }`}
            >
              {title}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="done"
          onClick={() => s.selectElements([])}
          className="m-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-le-ink-200 text-le-ink-900 shadow-sm"
        >
          <Check aria-hidden="true" size={18} />
        </button>
      </div>
    </div>
  );
}

export const MobileBottomBar = observer(function MobileBottomBar({
  store,
  sections,
  inspector,
}: {
  store: unknown;
  sections: ReadonlyArray<MobileSection>;
  inspector: ReactNode;
}) {
  const selected = selectedElementsDeep(store as never).length > 0;
  return (
    <>
      {/* 캔버스 아래 삽입 띠(글상자·도형)는 하단 띠의 텍스트·요소 탭과 겹친다. */}
      <style>{"[data-dp-insert-dock] { display: none; }"}</style>
      {selected ? (
        <InspectorBar store={store} inspector={inspector} />
      ) : (
        <SectionBar store={store} sections={sections} />
      )}
    </>
  );
});
