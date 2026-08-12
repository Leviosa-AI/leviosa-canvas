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
  documentFamilies,
  onSelect,
}: {
  value: string;
  documentFamilies: string[];
  onSelect: (family: string) => Promise<void>;
}) {
  const { t } = useTranslation("branding");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [tags, setTags] = useState<FontTag[]>([]);
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

  const renderFont = (font: EditorFont) => (
    <CommandItem
      key={`${font.source}:${font.id}`}
      value={`${font.label} ${font.labelEn} ${font.family}`}
      onSelect={() => void select(font.family)}
      disabled={loading !== null}
      className="group min-h-[56px] gap-2 px-2 py-1"
    >
      <span className="flex h-11 min-w-0 flex-1 items-center overflow-hidden">
        <Image
          src={font.previewSrc}
          alt={font.label}
          width={560}
          height={88}
          className="h-auto w-full object-contain object-left"
          unoptimized
        />
      </span>
      {font.latinOnly ? (
        <span className="shrink-0 rounded border border-neutral-200 px-1 py-0.5 text-[10px] leading-none text-neutral-500">
          {t("detailPage.properties.fontLatinOnly")}
        </span>
      ) : null}
      {loading === font.family ? (
        <LoaderCircle
          aria-label={t("detailPage.properties.fontLoading")}
          className="shrink-0 animate-spin text-neutral-500"
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
          className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-left text-sm text-neutral-900 outline-none hover:bg-neutral-50 focus:border-neutral-400"
        >
          <span className="min-w-0 truncate">{selected?.label ?? value}</span>
          <ChevronDown aria-hidden="true" className="shrink-0 text-neutral-400" size={14} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="left"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[120] w-[340px] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-[0_10px_32px_rgba(0,0,0,0.14)]"
        >
          <div
            role="group"
            aria-label={t("detailPage.properties.fontTagFilter")}
            className="flex flex-wrap gap-1 border-b border-neutral-100 px-2 py-2"
          >
            <button
              type="button"
              aria-pressed={tags.length === 0}
              onClick={() => setTags([])}
              className={`rounded-full border px-2 py-0.5 text-[11px] leading-4 transition-colors ${
                tags.length === 0
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
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
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
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
          {error ? (
            <p role="alert" className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
              {t("detailPage.properties.fontLoadFailed")}
            </p>
          ) : null}
          {selected ? (
            <div className="border-t border-neutral-100 px-3 py-2 text-[11px] leading-4 text-neutral-500">
              <a
                href={selected.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-neutral-700 underline decoration-neutral-300 underline-offset-2"
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
          <PopoverPrimitive.Arrow className="fill-white" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
