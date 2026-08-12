"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { AnnotationDialog } from "./annotation-dialog";
import {
  MAX_DESIGN_REFERENCES,
  type DesignReference,
} from "../../lib/detail-page/design-reference";
import {
  replaceCanvasPage,
  type CanvasDocument,
} from "../../lib/detail-page/replace-page";
import { onSectionReauthorRequested } from "../../lib/detail-page/section-reauthor-bus";
import { useDetailPageHost } from "./detail-page-host-context";

/**
 * 화면 재저작 배선 — 페이지 툴바의 요청을 받아 모달을 띄우고, 결과 페이지를 문서에
 * 갈아 끼운다.
 *
 * 편집기 본체에서 분리한 이유는 두 가지다. 첫째, 이 흐름은 store 와 generatedId 만
 * 있으면 완결된다. 둘째, 워크스페이스가 memo 로 잡혀 있어 콜백을 아래로 내리면
 * 캔버스가 통째로 다시 그려진다.
 *
 * 밑그림은 ``store.toDataURL({pageId})`` 로 뜬다 — 편집기가 지금 보여 주는 그대로다.
 * 유저는 자기가 보는 화면 위에 표시하지, 서버가 렌더한 다른 그림 위에 표시하지 않는다.
 */

type StoreLike = {
  toDataURL: (opts: {
    pageId?: string;
    pixelRatio?: number;
    mimeType?: string;
  }) => Promise<string>;
  toJSON: () => Record<string, unknown>;
  loadJSON: (json: unknown) => void;
  pages?: Array<{ id: string; computedHeight?: number }>;
};

/**
 * 지금 이 화면이 편집기에서 몇 px 인지. 서버는 이 값을 모델에게 "지금 높이"로 알려 준다.
 *
 * 저장본에서 읽지 않고 살아 있는 스토어에서 읽는 이유: 높이는 손잡이·우측 패널로 바뀌고
 * 그 값은 저장을 누르기 전까지 서버에 없다. 저장본을 기준으로 삼으면 방금 잡아 놓은 높이를
 * 재저작이 되돌린다.
 */
export function livePageHeight(store: unknown, pageId: string): number | undefined {
  const page = (store as StoreLike).pages?.find((p) => p.id === pageId);
  const height = Math.round(Number(page?.computedHeight ?? 0));
  return Number.isFinite(height) && height > 0 ? height : undefined;
}

export function SectionReauthorController({
  store,
  generatedId,
  templateId,
}: {
  store: unknown;
  /** 없으면 배선하지 않는다 — 툴바 버튼도 뜨지 않는다. */
  generatedId?: string;
  /**
   * 지금 열려 있는 문서의 템플릿 id.
   *
   * dev-canvas 는 픽스처를 **브라우저에서만** 띄운다 — 서버의 scratch 인스턴스에는
   * 템플릿도 HTML 도 없어서, 알려 주지 않으면 시연 하니스에서는 이 기능을 눌러 볼 수
   * 없다. 실제 인스턴스에서는 서버가 자기 템플릿을 쓰므로 무시된다.
   */
  templateId?: string;
}) {
  const { t } = useTranslation("branding");
  const { api } = useDetailPageHost();
  const [pageId, setPageId] = useState<string | null>(null);
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!generatedId) return;
    return onSectionReauthorRequested((requestedPageId) => {
      setError(null);
      setNotice(null);
      setPageId(requestedPageId);
      setBaseImage(null);
      // 렌더는 비동기다(Canvas 가 대상 페이지를 잠깐 강제 마운트한다). 실패해도 모달은
      // 열어 둔다 — 밑그림 없이도 글로만 지시할 수 있어야 한다.
      void (store as StoreLike)
        .toDataURL({ pageId: requestedPageId, pixelRatio: 1 })
        .then(setBaseImage)
        .catch(() => setBaseImage(null));
    });
  }, [store, generatedId]);

  const close = useCallback(() => {
    if (busy) return;
    setPageId(null);
    setBaseImage(null);
    setError(null);
  }, [busy]);

  const submit = useCallback(
    async ({
      instruction,
      annotatedImage,
      references,
    }: {
      instruction: string;
      annotatedImage: string | null;
      references: DesignReference[];
    }) => {
      if (!generatedId || !pageId) return;
      setBusy(true);
      setError(null);
      try {
        const result = await api.reauthorDetailPageSection(generatedId, {
          label: pageId,
          instruction,
          annotated_image: annotatedImage ?? undefined,
          // 축을 고른 장은 객체로 간다 — 서버가 그 장의 딱지에 축을 적어야 "1번 이미지의
          // 색감"이라는 지시가 어느 장을 가리키는지 모델이 안다.
          reference_images: references.length ? references : undefined,
          current_height: livePageHeight(store, pageId),
          template_id: templateId,
        });
        const document = (store as StoreLike).toJSON() as CanvasDocument;
        const next = replaceCanvasPage(document, result.page);
        if (next === document) {
          setError(
            t("detailPage.reauthor.pageMissing", {
              defaultValue: "고친 화면을 문서에서 찾지 못했어요.",
            }),
          );
          return;
        }
        // 첫 로드와 **같은 길**로 넣는다 — 어댑터를 안 거친다. 그 어댑터는 SDK가 못 읽는
        // 장식을 대표 단색으로 낮추던 것이라, 원본을 그대로 읽는 우리 렌더러에 넣으면
        // 그 화면만 밋밋해진다.
        (store as StoreLike).loadJSON(next);
        setPageId(null);
        setBaseImage(null);
        if (!result.lint_ok) {
          // 규약 위반이 남아도 결과는 적용한다. 조용히 되돌리면 유저는 "아무 일도 안
          // 일어났다"만 보고, 그건 크레딧만 쓴 상태와 구별되지 않는다.
          setNotice(
            t("detailPage.reauthor.lintWarning", {
              defaultValue:
                "화면을 바꿨지만 규약 검사에 걸린 항목이 있어요. 눈으로 한 번 확인해 주세요.",
            }),
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("detailPage.reauthor.failed", {
                defaultValue: "화면을 다시 만들지 못했어요.",
              }),
        );
      } finally {
        setBusy(false);
      }
    },
    [api, generatedId, pageId, store, t, templateId],
  );

  if (!generatedId) return null;

  return (
    <>
      <AnnotationDialog
        open={Boolean(pageId)}
        // 렌더 전이면 흰 밑그림으로 연다 — 글로만 지시하는 길을 막지 않는다.
        imageUrl={baseImage ?? BLANK_BASE}
        title={t("detailPage.reauthor.title", {
          defaultValue: "이 화면 다시 만들기",
        })}
        description={t("detailPage.reauthor.description", {
          defaultValue:
            "고칠 자리를 표시하고 어떻게 바꿀지 적어주세요. 칸 수·표 같은 구조는 물론 " +
            '화면 길이도 바뀔 수 있어요("더 시원하게", "너무 길어요").',
        })}
        submitLabel={t("detailPage.reauthor.submit", {
          defaultValue: "다시 만들기",
        })}
        maxReferences={MAX_DESIGN_REFERENCES}
        busy={busy}
        error={error}
        onSubmit={submit}
        onClose={close}
      />
      {notice ? (
        <div className="fixed bottom-4 left-1/2 z-[110] -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 shadow-lg">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-3 font-semibold underline"
          >
            {t("detailPage.annotate.close", { defaultValue: "닫기" })}
          </button>
        </div>
      ) : null}
    </>
  );
}

/** 1×1 흰 픽셀. 밑그림 렌더가 실패해도 캔버스가 열리도록 하는 최소 배경. */
const BLANK_BASE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
