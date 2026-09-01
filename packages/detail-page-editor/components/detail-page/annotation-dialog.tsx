"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../ui/button";
import {
  AnnotationCanvas,
  type AnnotationCanvasHandle,
} from "./annotation-canvas";
import {
  DESIGN_REFERENCE_ASPECTS,
  MAX_DESIGN_REFERENCES,
  REFERENCE_ACCEPT_ATTR,
  finalizeReferenceDataUri,
  readReferenceFile,
  referenceOrdinal,
  type DesignReference,
  type DesignReferenceAspect,
} from "../../lib/detail-page/design-reference";

/**
 * 그림으로 가리켜 고치는 모달 — 밑그림 위에 표시하고, 무엇을 바꿀지 적는다.
 *
 * 이미지 편집(선택 이미지)과 화면 재저작(섹션 하나)이 같은 모달을 쓴다. 유저가 하는
 * 일이 같기 때문이다: **어디를** 그림으로, **무엇을** 글로.
 *
 * 밑그림은 반드시 **오염되지 않는 출처**로 받는다(``imageUrl`` 이 data URI 이거나
 * 동일 출처). 교차 출처 이미지를 캔버스에 그리면 합성이 SecurityError 로 터지는데,
 * 그 실패는 유저가 다 그리고 제출을 누른 **다음에야** 드러난다.
 *
 * ``maxReferences`` 를 주면 "이렇게 생기게" 참고 사진을 붙일 수 있다. 마킹본과는 **다른
 * 역할**이라 화면에서도 갈라 놓는다: 마킹본은 캔버스(고칠 화면 자체)이고 레퍼런스는 그
 * 아래 줄(남의 화면)이다. 같은 자리에 두면 유저도 모델도 헷갈린다.
 *
 * 참고 사진에는 **번호와 축**이 붙는다. 유저가 실제로 쓰는 문장이 "1번 이미지의 색감과
 * 폰트를 참고하고 2번 이미지의 레이아웃을 참고해 줘"이기 때문이다. 번호를 화면에 적어
 * 두지 않으면 그 문장을 쓸 근거가 없고, 축을 못 고르면 모델이 한 장을 통째로 따라가
 * 남의 상세페이지가 된다.
 */

export type AnnotationSubmit = {
  /** 프롬프트(비어 있을 수 있다 — 손글씨로만 지시하는 경우). */
  instruction: string;
  /** 원본+마킹 합성 PNG data URI. 그린 것이 없으면 null. */
  annotatedImage: string | null;
  /** "이렇게 생기게" 참고 사진. 붙이지 않았으면 빈 배열. 순서가 곧 번호다. */
  references: DesignReference[];
};

let referenceSeq = 0;

/** 썸네일 열쇠. 같은 파일을 두 번 붙여도 갈라 잡아야 한다. */
function nextReferenceId(): string {
  referenceSeq += 1;
  return `ref-${referenceSeq}`;
}

export function AnnotationDialog({
  open,
  imageUrl,
  title,
  description,
  placeholder,
  submitLabel,
  maxReferences = 0,
  busy = false,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  /** 밑그림. data URI 또는 동일 출처 URL. 없으면 모달을 열지 않는다. */
  imageUrl: string | null;
  title: string;
  description?: string;
  placeholder?: string;
  submitLabel: string;
  /** 0 이면 레퍼런스 줄을 아예 띄우지 않는다 — 이미지 편집 쪽은 쓰지 않는 기능이다. */
  maxReferences?: number;
  busy?: boolean;
  error?: string | null;
  onSubmit: (input: AnnotationSubmit) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("branding");
  const canvasRef = useRef<AnnotationCanvasHandle>(null);
  const [instruction, setInstruction] = useState("");
  const [hasMarks, setHasMarks] = useState(false);
  const [flattenError, setFlattenError] = useState<string | null>(null);
  // 같은 항목을 나중에 갈아 끼워야 해서 자리(index)가 아니라 열쇠로 잡는다 — 그 사이에
  // 유저가 앞의 것을 빼면 자리는 밀린다.
  const [references, setReferences] = useState<
    Array<{ id: string; uri: string; aspects: DesignReferenceAspect[] }>
  >([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setInstruction("");
      setHasMarks(false);
      setFlattenError(null);
      setReferences([]);
      setAttachError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const submit = useCallback(async () => {
    if (busy) return;
    setFlattenError(null);
    let annotatedImage: string | null = null;
    try {
      annotatedImage = (await canvasRef.current?.flatten()) ?? null;
    } catch {
      // 합성이 실패하면 마킹 없이 보내지 않는다 — 유저가 가리킨 자리가 통째로 사라진
      // 채로 편집이 돌면 "엉뚱한 데를 고쳤다"가 된다. 차라리 멈추고 말한다.
      setFlattenError(
        t("detailPage.annotate.flattenFailed", {
          defaultValue: "표시한 그림을 합치지 못했어요. 다시 시도해 주세요.",
        }),
      );
      return;
    }
    onSubmit({
      instruction: instruction.trim(),
      annotatedImage,
      references: references.map((ref) => ({ url: ref.uri, aspects: ref.aspects })),
    });
  }, [busy, instruction, onSubmit, references, t]);

  const attach = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || maxReferences <= 0) return;
      setAttachError(null);
      const room = maxReferences - references.length;
      if (room <= 0) return;
      const picked = Array.from(files).slice(0, room);
      // 같은 파일을 지웠다가 다시 고를 수 있어야 한다 — 값이 남아 있으면 change 가 안 뜬다.
      if (fileRef.current) fileRef.current.value = "";

      const added: Array<{ id: string; uri: string; aspects: DesignReferenceAspect[] }> =
        [];
      for (const file of picked) {
        try {
          added.push({
            id: nextReferenceId(),
            uri: await readReferenceFile(file),
            aspects: [],
          });
        } catch (err) {
          // 형식·원본 크기는 **읽기 전에** 걸러 이 자리에서 말한다. 제출 뒤에 422 로
          // 돌아오면 유저는 그림을 고르고 축을 고르고 지시를 다 적은 다음에야 안다.
          setAttachError(
            err instanceof Error ? err.message : "참고 사진을 붙이지 못했어요.",
          );
        }
      }
      if (!added.length) return;
      // 원본으로 **먼저** 띄운다. 줄이기는 디코드를 기다려야 하는데, 그 사이 아무것도
      // 안 뜨면 유저는 첨부가 먹히지 않은 줄 안다.
      setReferences((prev) => [...prev, ...added].slice(0, maxReferences));

      for (const item of added) {
        void finalizeReferenceDataUri(item.uri).then((result) => {
          if ("error" in result) {
            // 줄이기로도 상한 아래로 못 내려간 그림은 붙여 둘 수 없다 — 그대로 두면
            // 제출이 서버에서 막힌다.
            setReferences((prev) => prev.filter((ref) => ref.id !== item.id));
            setAttachError(result.error);
            return;
          }
          if (result.uri === item.uri) return;
          setReferences((prev) =>
            prev.map((ref) => (ref.id === item.id ? { ...ref, uri: result.uri } : ref)),
          );
        });
      }
    },
    [maxReferences, references.length],
  );

  const toggleAspect = useCallback((id: string, aspect: DesignReferenceAspect) => {
    setReferences((prev) =>
      prev.map((ref) =>
        ref.id === id
          ? {
              ...ref,
              aspects: ref.aspects.includes(aspect)
                ? ref.aspects.filter((a) => a !== aspect)
                : [...ref.aspects, aspect],
            }
          : ref,
      ),
    );
  }, []);

  if (!open || !imageUrl) return null;

  const canSubmit = !busy && (hasMarks || instruction.trim().length > 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-le-ink-900/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-le-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-le-ink-200 px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-le-semibold text-le-ink-900">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-le-ink-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={t("detailPage.annotate.close", { defaultValue: "닫기" })}
            onClick={onClose}
            disabled={busy}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-le-lg text-le-ink-400 transition-colors hover:bg-le-ink-100 hover:text-le-ink-900 disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1">
          <AnnotationCanvas
            ref={canvasRef}
            imageUrl={imageUrl}
            onChange={setHasMarks}
            labels={{
              pen: t("detailPage.annotate.tools.pen", { defaultValue: "그리기" }),
              rect: t("detailPage.annotate.tools.rect", { defaultValue: "박스" }),
              arrow: t("detailPage.annotate.tools.arrow", { defaultValue: "화살표" }),
              text: t("detailPage.annotate.tools.text", { defaultValue: "메모" }),
              eraser: t("detailPage.annotate.tools.eraser", { defaultValue: "지우개" }),
              select: t("detailPage.annotate.tools.select", { defaultValue: "이동" }),
              color: t("detailPage.annotate.tools.color", { defaultValue: "색상" }),
              undo: t("detailPage.annotate.tools.undo", { defaultValue: "실행 취소" }),
              redo: t("detailPage.annotate.tools.redo", { defaultValue: "다시 실행" }),
              note: t("detailPage.annotate.tools.note", { defaultValue: "메모 입력" }),
            }}
          />
        </div>

        <div className="border-t border-le-ink-200 px-5 py-3">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            disabled={busy}
            placeholder={
              placeholder ??
              t("detailPage.annotate.placeholder", {
                defaultValue:
                  "표시한 곳을 어떻게 바꿀지 적어주세요. 그림 위에 손글씨로 적어도 돼요.",
              })
            }
            className="w-full resize-none rounded-le-lg border border-le-ink-200 px-3 py-2 text-sm text-le-ink-900 outline-none placeholder:text-le-ink-400 focus:border-le-ink-400 disabled:bg-le-ink-50"
          />
          {maxReferences > 0 ? (
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {references.map((ref, index) => (
                <div
                  key={ref.id}
                  className="flex items-start gap-2 rounded-le-lg border border-le-ink-200 p-1.5"
                >
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-le-md bg-le-ink-100">
                    {/* 붙인 사진은 data URI라 next/image 로 최적화할 것이 없다. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ref.uri}
                      alt={t("detailPage.reauthor.referenceAlt", {
                        defaultValue: "참고 사진",
                      })}
                      className="h-full w-full object-cover"
                    />
                    {/* 번호는 프롬프트에 쓰는 이름이다 — 화면에 없으면 "2번 이미지"라고
                        적을 근거가 없다. */}
                    <span className="absolute left-0.5 top-0.5 rounded bg-le-ink-900/75 px-1 text-[10px] font-le-semibold leading-4 text-le-on-accent">
                      {referenceOrdinal(index)}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setReferences((prev) => prev.filter((_, i) => i !== index))
                      }
                      aria-label={t("detailPage.reauthor.referenceRemove", {
                        defaultValue: "참고 사진 빼기",
                      })}
                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-le-ink-900/70 text-le-on-accent disabled:opacity-40"
                    >
                      <X size={10} />
                    </button>
                  </div>
                  <div className="flex max-w-[15rem] flex-wrap gap-1">
                    {DESIGN_REFERENCE_ASPECTS.map((aspect) => {
                      const on = ref.aspects.includes(aspect.key);
                      return (
                        <button
                          key={aspect.key}
                          type="button"
                          disabled={busy}
                          aria-pressed={on}
                          // 축 이름만으로는 "내용 구성"이 문구까지인지 알 수 없다.
                          title={aspect.hint}
                          onClick={() => toggleAspect(ref.id, aspect.key)}
                          className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-40 ${
                            on
                              ? "border-le-ink-900 bg-le-ink-900 text-le-on-accent"
                              : "border-le-ink-200 text-le-ink-500 hover:border-le-ink-400 hover:text-le-ink-700"
                          }`}
                        >
                          {aspect.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {references.length < maxReferences ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="flex h-[4.75rem] items-center gap-1.5 rounded-le-lg border border-dashed border-le-ink-300 px-3 text-xs text-le-ink-500 transition-colors hover:border-le-ink-400 hover:text-le-ink-700 disabled:opacity-40"
                >
                  <ImagePlus size={14} />
                  {t("detailPage.reauthor.referenceAdd", {
                    defaultValue: "이렇게 생기게 (참고 사진)",
                  })}
                </button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept={REFERENCE_ACCEPT_ATTR}
                multiple
                hidden
                onChange={(e) => void attach(e.target.files)}
              />
              {references.length ? (
                <p className="w-full text-[11px] text-le-ink-400">
                  {t("detailPage.reauthor.referenceHint", {
                    defaultValue:
                      "축을 고르면 그 장에서는 고른 것만 따라가요(안 고르면 배치와 구성만). " +
                      '지시에 "1번 이미지의 색감처럼"이라고 적어도 돼요. 참고 사진 자체는 ' +
                      "페이지에 들어가지 않아요.",
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
          {error || flattenError || attachError ? (
            <p className="mt-2 text-xs text-le-danger-600">
              {error ?? flattenError ?? attachError}
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-le-ink-400">
              {hasMarks
                ? t("detailPage.annotate.marked", {
                    defaultValue: "표시한 자리를 기준으로 고쳐요.",
                  })
                : t("detailPage.annotate.unmarked", {
                    defaultValue: "고칠 자리를 그림으로 표시하면 더 정확해요.",
                  })}
            </p>
            <Button type="button" onClick={submit} disabled={!canSubmit}>
              {busy ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                  {t("detailPage.annotate.working", { defaultValue: "고치는 중…" })}
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
