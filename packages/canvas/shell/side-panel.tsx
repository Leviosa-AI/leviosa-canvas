"use client";

/**
 * 좌측 패널 껍데기 — 탭 레일과 그 옆에 열리는 패널 하나.
 *
 * 내용은 하나도 안 들고 있다. 섹션 목록을 받아서 **탭을 세우고, 고른 것의 패널을
 * 자리에 놓는 일**만 한다. 사진·텍스트·도형·레이어가 무엇인지는 이 파일이 알 필요가
 * 없고, 알면 안 된다(그걸 아는 순간 상세페이지 전용 부품이 된다).
 *
 * 계약은 스톡 편집기의 `SidePanel`과 같게 뒀다 — 지금 쓰고 있는 12개 섹션을 한 줄도
 * 안 고치고 그대로 옮겨 꽂기 위해서다.
 *
 * - `Tab`은 `{ active, onClick }`을 받는다.
 * - `Panel`은 `{ store }`를 받는다.
 * - 열린 패널 이름은 스토어에 산다(`store.openedSidePanel`) — 캔버스 쪽도 그걸 읽는다.
 *
 * 디자인 토큰을 안 쓴다(G7 경계 4번). Tailwind 클래스도 CSS 변수도 없이 인라인
 * 스타일만 쓴다 — `leviosa-agency`에는 우리 토큰이 없다.
 */

import { useEffect, useRef, type ReactElement, type ReactNode } from "react";

import type { CanvasStore } from "../store";
import { useCanvasVersion } from "../use-canvas";

export type PanelSection = {
  /** 스토어에 적히는 이름. `store.openedSidePanel`과 견준다. */
  name: string;
  Tab: (props: PanelTabProps) => ReactElement | null;
  Panel: (props: { store: unknown }) => ReactElement | null;
  /** false면 레일에 안 보인다(패널만 열 수 있다). */
  visibleInList?: boolean;
};

export type PanelTabProps = {
  active?: boolean;
  onClick?: () => void;
  [key: string]: unknown;
};

// 폭도 갈아 끼울 수 있게 변수로 낸다 — 좁은 레일을 쓰는 소비자가 있다.
const RAIL_WIDTH = "var(--lc-rail-width, 76px)";
const PANEL_WIDTH = "var(--lc-panel-width, 320px)";

/**
 * 레일 버튼 하나.
 *
 * 아이콘과 이름을 세로로 쌓는다. 쓰는 쪽이 아이콘을 자식으로 넣는다 — 아이콘 묶음에
 * 기대지 않으려는 것이다(패키지가 lucide를 끌고 갈 수는 없다).
 */
export function SectionTab({
  name,
  active,
  onClick,
  children,
}: PanelTabProps & { name?: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active === true}
      data-lc-tab={name ?? ""}
      data-lc-part="rail-tab"
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        padding: "12px 4px",
        border: "none",
        background: active
          ? "var(--lc-tab-active-bg, rgba(37, 99, 235, 0.1))"
          : "transparent",
        color: active
          ? "var(--lc-tab-active-fg, #1d4ed8)"
          : "var(--lc-tab-fg, #525252)",
        fontSize: 12,
        lineHeight: 1.2,
        whiteSpace: "pre",
        cursor: "pointer",
      }}
    >
      {children}
      <span>{name}</span>
    </button>
  );
}

export function SidePanel({
  store,
  sections,
  defaultSection,
}: {
  store: CanvasStore;
  sections: ReadonlyArray<PanelSection>;
  /** 처음에 열어 둘 섹션. 빈 문자열이면 접힌 채로 연다. */
  defaultSection?: string;
}) {
  useCanvasVersion(store);
  const opened = store.openedSidePanel;

  // 처음 한 번만 연다. 이 뒤로는 유저가 고른 것이 정답이다 — 다시 열면 탭을 옮길 때마다
  // 기본 섹션으로 튕겨 나간다.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (defaultSection !== undefined) store.openSidePanel(defaultSection);
  }, [store, defaultSection]);

  const listed = sections.filter((section) => section.visibleInList !== false);
  const Panel = sections.find((section) => section.name === opened)?.Panel;

  return (
    <div
      data-lc-side-panel={opened || "collapsed"}
      data-lc-part="side-panel"
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        background: "var(--lc-surface, #ffffff)",
        borderRight: "1px solid var(--lc-border, #e5e5e5)",
      }}
    >
      <div
        data-lc-part="rail"
        style={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          overflowY: "auto",
          borderRight: opened ? "1px solid var(--lc-border, #e5e5e5)" : "none",
        }}
      >
        {listed.map(({ name, Tab }) => (
          <Tab
            key={name}
            active={name === opened}
            // 열린 탭을 다시 누르면 접는다 — 캔버스를 넓게 보고 싶을 때 쓴다.
            onClick={() => store.openSidePanel(name === opened ? "" : name)}
          />
        ))}
      </div>
      {Panel ? (
        <div
          data-lc-part="panel"
          style={{
            width: PANEL_WIDTH,
            flexShrink: 0,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Panel store={store} />
        </div>
      ) : null}
    </div>
  );
}
