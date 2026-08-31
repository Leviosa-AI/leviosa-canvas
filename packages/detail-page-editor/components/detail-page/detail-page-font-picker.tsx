"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import {
  EDITOR_BUNDLE_FONTS,
  EDITOR_CATALOG_FONTS,
  filterFontsByTags,
  getEditorFont,
  type EditorFont,
} from "../../lib/detail-page-canvas/editor-fonts";
import { FONT_TAGS, type FontTag } from "../../lib/detail-page-canvas/font-tags";

export function DetailPageFontPicker({
  value,
  text,
  documentFamilies,
  onSelect,
}: {
  value: string;
  text: string;
  documentFamilies: string[];
  onSelect: (family: string) => Promise<void>;
}) {
  const { t } = useTranslation("branding");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [tags, setTags] = useState<FontTag[]>([]);
  const hasHangul = /\p{Script=Hangul}/u.test(text);
  /** 404 로 떨어진 미리보기. 한 번 떨어지면 다시 안 부른다. */
  const [previewsMissing, setPreviewsMissing] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const selected = getEditorFont(value);
  const catalogFonts = filterFontsByTags(EDITOR_CATALOG_FONTS, tags);
  const bundleFonts = filterFontsByTags(EDITOR_BUNDLE_FONTS, tags);
  // Document fonts carry no tags, so any active chip is a statement that they are
  // not what the user is looking for.
  const legacyFamilies = tags.length
    ? []
    : documentFamilies.filter((family) => !getEditorFont(family));

  const toggleTag = (tag: FontTag) => {
    setTags((current) =>
      current.includes(tag)
        ? current.filter((candidate) => candidate !== tag)
        : [...current, tag],
    );
  };

  const select = async (family: string) => {
    setLoading(family);
    setError(false);
    try {
      await onSelect(family);
      setOpen(false);
    } catch (fontError) {
      console.error(`Failed to load detail-page font "${family}"`, fontError);
      setError(true);
    } finally {
      setLoading(null);
    }
  };

  /**
   * 미리보기 WebP 는 소비자 앱의 정적 자산이다(`assets.detailFontPreviews`).
   *
   * 그걸 굽는 스크립트를 아직 안 돌린 소비자에서는 이 그림이 통째로 404 다. 예전에는
   * 그 자리에 깨진 이미지 아이콘과 alt 글자만 남아, 목록이 폰트 이름표만 늘어선 줄이
   * 됐다 — 무엇을 고르는지 볼 수가 없다. 떨어지면 **이름을 그 폰트로** 그린다.
   * 완전한 미리보기는 아니지만(가변 자소 몇 자뿐), 고를 수는 있다.
   */
  const renderFont = (font: EditorFont) => (
    <CommandItem
      key={`${font.source}:${font.id}`}
      value={`${font.label} ${font.labelEn} ${font.family}`}
      onSelect={() => void select(font.family)}
      disabled={loading !== null || (hasHangul && font.latinOnly)}
      className="group min-h-[56px] gap-2 px-2 py-1"
    >
      <span className="flex h-11 min-w-0 flex-1 items-center overflow-hidden">
        {previewsMissing.has(font.previewSrc) ? (
          <span
            className="truncate text-lg leading-none"
            style={{ fontFamily: `"${font.family}", sans-serif` }}
          >
            {font.label}
          </span>
        ) : (
          <Image
            src={font.previewSrc}
            alt={font.label}
            width={560}
            height={88}
            className="h-auto w-full object-contain object-left"
            unoptimized
            onError={() =>
              setPreviewsMissing((seen) => new Set(seen).add(font.previewSrc))
            }
          />
        )}
      </span>
      {font.latinOnly ? (
        <span className="shrink-0 rounded border border-le-ink-200 px-1 py-0.5 text-[10px] leading-none text-le-ink-500">
          {t("detailPage.properties.fontLatinOnly")}
        </span>
      ) : null}
      {loading === font.family ? (
        <LoaderCircle
          aria-label={t("detailPage.properties.fontLoading")}
          className="shrink-0 animate-spin text-le-ink-500"
          size={15}
        />
      ) : value === font.family ? (
        <Check aria-hidden="true" className="shrink-0" size={15} />
      ) : null}
    </CommandItem>
  );

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(false);
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={t("detailPage.properties.chooseFont")}
          aria-expanded={open}
          className="flex min-w-0 items-center justify-between gap-2 rounded-le-md border border-le-ink-200 bg-le-surface px-2 py-1.5 text-left text-sm text-le-ink-900 outline-none hover:bg-le-ink-50 focus:border-le-ink-400"
        >
          <span className="min-w-0 truncate">{selected?.label ?? value}</span>
          <ChevronDown aria-hidden="true" className="shrink-0 text-le-ink-400" size={14} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="left"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[120] w-[340px] overflow-hidden rounded-le-lg border border-le-ink-200 bg-le-surface shadow-[0_10px_32px_rgba(0,0,0,0.14)]"
        >
          <div
            role="group"
            aria-label={t("detailPage.properties.fontTagFilter")}
            className="flex flex-wrap gap-1 border-b border-le-ink-100 px-2 py-2"
          >
            <button
              type="button"
              aria-pressed={tags.length === 0}
              onClick={() => setTags([])}
              className={`rounded-full border px-2 py-0.5 text-[11px] leading-4 transition-colors ${
                tags.length === 0
                  ? "border-le-ink-900 bg-le-ink-900 text-le-on-accent"
                  : "border-le-ink-200 text-le-ink-600 hover:bg-le-ink-50"
              }`}
            >
              {t("detailPage.properties.fontTagAll")}
            </button>
            {FONT_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={tags.includes(tag)}
                onClick={() => toggleTag(tag)}
                className={`rounded-full border px-2 py-0.5 text-[11px] leading-4 transition-colors ${
                  tags.includes(tag)
                    ? "border-le-ink-900 bg-le-ink-900 text-le-on-accent"
                    : "border-le-ink-200 text-le-ink-600 hover:bg-le-ink-50"
                }`}
              >
                {t(`detailPage.fontTags.${tag}`)}
              </button>
            ))}
          </div>
          <Command>
            <CommandInput
              autoFocus
              placeholder={t("detailPage.properties.fontSearch")}
              aria-label={t("detailPage.properties.fontSearch")}
            />
            <CommandList className="max-h-[420px]">
              <CommandEmpty>
                {t("detailPage.properties.fontEmpty")}
              </CommandEmpty>
              {catalogFonts.length ? (
                <CommandGroup heading={t("detailPage.properties.fontCatalog")}>
                  {catalogFonts.map(renderFont)}
                </CommandGroup>
              ) : null}
              {bundleFonts.length ? (
                <CommandGroup heading={t("detailPage.properties.fontBundle")}>
                  {bundleFonts.map(renderFont)}
                </CommandGroup>
              ) : null}
              {legacyFamilies.length ? (
                <CommandGroup heading={t("detailPage.properties.documentFonts")}>
                  {legacyFamilies.map((family) => (
                    <CommandItem
                      key={family}
                      value={family}
                      onSelect={() => void select(family)}
                      disabled={loading !== null}
                      className="gap-2 px-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1 truncate">{family}</span>
                      {value === family ? <Check aria-hidden="true" size={15} /> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
          {hasHangul ? (
            <p className="border-t border-le-ink-100 px-3 py-2 text-xs text-le-ink-500">
              {t("detailPage.properties.fontLatinOnlyUnavailable")}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="border-t border-le-danger-100 bg-le-danger-50 px-3 py-2 text-xs text-le-danger-600">
              {t("detailPage.properties.fontLoadFailed")}
            </p>
          ) : null}
          {selected ? (
            <div className="border-t border-le-ink-100 px-3 py-2 text-[11px] leading-4 text-le-ink-500">
              <a
                href={selected.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="font-le-medium text-le-ink-700 underline decoration-le-ink-300 underline-offset-2"
              >
                {t("detailPage.properties.fontLicense")}: {selected.licenseName}
              </a>
              {selected.licenseNoteKey ? (
                <span className="ml-1">
                  · {t(`detailPage.fontLicenseNotes.${selected.licenseNoteKey}`)}
                </span>
              ) : null}
            </div>
          ) : null}
          <PopoverPrimitive.Arrow className="fill-le-on-accent" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
