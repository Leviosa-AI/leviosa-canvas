"use client";

import { Pipette } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

// ── Preset palette — popular colors for cardnews/social media ──────────────
const PRESET_COLORS = [
  // Row 1: Neutrals
  "#000000", "#333333", "#666666", "#999999", "#CCCCCC", "#FFFFFF",
  // Row 2: Warm
  "#FF0000", "#FF4444", "#FF8800", "#FFBB00", "#FFEE00", "#FFE4E1",
  // Row 3: Cool
  "#0066FF", "#00AAFF", "#00CCCC", "#00CC66", "#00AA00", "#E0F0FF",
  // Row 4: Purple/Pink
  "#6600CC", "#9933FF", "#CC66FF", "#FF66CC", "#FF3399", "#F5E6FF",
  // Row 5: Earth/Brand
  "#8B4513", "#D2691E", "#F4A460", "#2F4F4F", "#1A1A2E", "#FFF8DC",
];

const RECENT_COLORS_KEY = "leviosa-recent-colors";
const MAX_RECENT = 8;
const POPOVER_WIDTH = 224; // w-56 = 14rem = 224px
const POPOVER_HEIGHT_ESTIMATE = 320;

/** Checkerboard SVG data URI for transparent backgrounds */
export const CHECKER_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' y='4' width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' width='4' height='4' fill='%23fff'/%3E%3Crect y='4' width='4' height='4' fill='%23fff'/%3E%3C/svg%3E")`;

function getRecentColors(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_COLORS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function normalizeRecentColor(color: string): string {
  return color.trim().toUpperCase();
}

function addRecentColor(color: string): string[] {
  const hex = normalizeRecentColor(color);
  if (hex === "TRANSPARENT") return getRecentColors(); // don't store transparent in recents
  const recent = getRecentColors()
    .map(normalizeRecentColor)
    .filter((c) => c !== hex);
  recent.unshift(hex);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  try { localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recent)); } catch { /* */ }
  return recent;
}

/** Calculate popover position with viewport boundary clamping */
function calcPopoverPos(
  anchorRect: DOMRect,
  align: "start" | "end",
  side: "auto" | "top" | "bottom",
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = side === "top"
    ? anchorRect.top - POPOVER_HEIGHT_ESTIMATE - 6
    : anchorRect.bottom + 6;
  let left = align === "end" ? anchorRect.right - POPOVER_WIDTH : anchorRect.left;

  // Flip upward if overflowing bottom
  if (side === "auto" && top + POPOVER_HEIGHT_ESTIMATE > vh) {
    top = anchorRect.top - POPOVER_HEIGHT_ESTIMATE - 6;
  }
  // Clamp to viewport edges
  if (top < 4) top = 4;
  if (left + POPOVER_WIDTH > vw) left = vw - POPOVER_WIDTH - 4;
  if (left < 4) left = 4;

  return { top, left };
}

// ── Global: close other ColorInput popovers when a new one opens ──────────
const colorInputCloseCallbacks = new Set<() => void>();

function isTransparent(v: string): boolean {
  return v === "transparent" || v === "rgba(0,0,0,0)" || v === "rgba(0, 0, 0, 0)";
}

/**
 * Normalize any CSS colour the editor stores — ``rgb(255, 78, 154)`` from the
 * decomposer, a named colour, a 3- or 6-digit hex — to a ``#rrggbb`` string.
 * The swatch, preset/recent highlight, and hex field all expect hex, so a raw
 * ``rgb(...)`` fill was falling through to ``#000000`` and painting the picker
 * black even though the canvas rendered the real colour. Uses the browser's own
 * parser (canvas ``fillStyle`` round-trip) so every valid CSS colour resolves;
 * an invalid value or SSR falls back to black.
 */
function toHexColor(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  }
  // The decomposer/Canvas store colours as ``rgb(r, g, b)`` / ``rgba(...)``.
  // Parse those directly so the picker works without a canvas (and in tests);
  // the alpha channel is dropped since the swatch/hex field are solid-only.
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
  if (rgb) {
    const hex = (n: string) => Math.min(255, Number(n)).toString(16).padStart(2, "0");
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`.toLowerCase();
  }
  // Named colours ("black", "tomato", …): let the browser resolve them.
  if (typeof document !== "undefined") {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000000";
      ctx.fillStyle = v;
      const resolved = ctx.fillStyle;
      if (typeof resolved === "string" && resolved.startsWith("#")) {
        return resolved.toLowerCase();
      }
    }
  }
  return "#000000";
}

interface ColorInputProps {
  value: string;
  onChange: (color: string) => void;
  /** Size of the swatch button (default: "sm") */
  size?: "sm" | "md";
  /** Allow transparent color selection (default: false) */
  allowTransparent?: boolean;
  /** Horizontal popover alignment relative to the swatch (default: "end") */
  popoverAlign?: "start" | "end";
  /** Vertical popover placement preference (default: "auto") */
  popoverSide?: "auto" | "top" | "bottom";
}

/**
 * Color picker with swatch button → popover (presets, recent, eyedropper, hex, native picker).
 */
export function ColorInput({
  value,
  onChange,
  size = "sm",
  allowTransparent = false,
  popoverAlign = "end",
  popoverSide = "auto",
}: ColorInputProps) {
  const { t } = useTranslation("marketing");
  const [open, setOpen] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [hexInput, setHexInput] = useState("");
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const swatchPx = size === "md" ? "w-8 h-8" : "w-7 h-7";

  const isTransparentValue = isTransparent(value);
  // Resolve the stored colour (which may be ``rgb(...)``/named) to hex so the
  // swatch and hex field show the real colour instead of falling back to black.
  const safeColor = useMemo(
    () => (isTransparentValue ? "transparent" : toHexColor(value)),
    [isTransparentValue, value],
  );

  const closePopover = useCallback(() => setOpen(false), []);

  // Register/unregister close callback for mutual exclusion
  useEffect(() => {
    colorInputCloseCallbacks.add(closePopover);
    return () => { colorInputCloseCallbacks.delete(closePopover); };
  }, [closePopover]);

  const openPopover = useCallback(() => {
    // Close all other open ColorInput popovers
    colorInputCloseCallbacks.forEach((cb) => { if (cb !== closePopover) cb(); });

    setRecentColors(getRecentColors());
    setHexInput(isTransparentValue ? "" : safeColor);
    setMeasured(false);
    if (containerRef.current) {
      setPopoverPos(calcPopoverPos(containerRef.current.getBoundingClientRect(), popoverAlign, popoverSide));
    }
    setOpen(true);
  }, [safeColor, isTransparentValue, closePopover, popoverAlign, popoverSide]);

  // Track scroll & resize to reposition popover
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (containerRef.current) {
        setPopoverPos(calcPopoverPos(containerRef.current.getBoundingClientRect(), popoverAlign, popoverSide));
      }
    };
    // Capture phase to catch scrolls in any container (e.g. layer panel overflow-y-auto)
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, popoverAlign, popoverSide]);

  // After popover renders, re-measure actual height and adjust position
  useEffect(() => {
    if (!open || !popoverRef.current || !containerRef.current) return;
    const popoverEl = popoverRef.current;
    const anchorRect = containerRef.current.getBoundingClientRect();
    const actualHeight = popoverEl.offsetHeight;
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    let top = popoverSide === "top"
      ? anchorRect.top - actualHeight - 6
      : anchorRect.bottom + 6;
    let left = popoverAlign === "end" ? anchorRect.right - POPOVER_WIDTH : anchorRect.left;

    if (popoverSide === "auto" && top + actualHeight > vh) {
      top = anchorRect.top - actualHeight - 6;
    }
    if (top < 4) top = 4;
    if (left + POPOVER_WIDTH > vw) left = vw - POPOVER_WIDTH - 4;
    if (left < 4) left = 4;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPopoverPos({ top, left });
    setMeasured(true);
  }, [open, popoverAlign, popoverSide]);

  // Close on outside click (check both swatch container and portal popover)
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [open]);

  const selectColor = useCallback((color: string) => {
    onChange(color);
    setRecentColors(addRecentColor(color));
    setHexInput(isTransparent(color) ? "" : color.toUpperCase());
  }, [onChange]);

  const openEyeDropper = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dropper = new (window as any).EyeDropper();
      const result = await dropper.open();
      selectColor(result.sRGBHex);
    } catch { /* cancelled */ }
  }, [selectColor]);

  const handleHexSubmit = useCallback(() => {
    let hex = hexInput.trim();
    if (!hex.startsWith("#")) hex = "#" + hex;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      selectColor(hex);
    }
  }, [hexInput, selectColor]);

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Swatch button */}
      <button
        type="button"
        onClick={() => open ? setOpen(false) : openPopover()}
        className={`${swatchPx} rounded-lg border-2 border-[var(--color-border)] cursor-pointer shrink-0 transition-all hover:border-[var(--color-primary)] hover:shadow-md hover:scale-105 active:scale-95`}
        style={{
          backgroundColor: isTransparentValue ? undefined : safeColor,
          backgroundImage: isTransparentValue ? CHECKER_BG : undefined,
          backgroundSize: isTransparentValue ? "8px 8px" : undefined,
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)",
        }}
        title={isTransparentValue ? "transparent" : safeColor}
      />

      {/* Popover — rendered via portal to escape overflow:hidden containers */}
      {open && popoverPos && createPortal(
        <div
          ref={popoverRef}
          data-layer-panel
          className={`fixed z-[200] w-56 bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl shadow-lg p-3 space-y-2.5 transition-opacity duration-75 ${measured ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          style={{ top: popoverPos.top, left: popoverPos.left }}
        >
          {/* Transparent + Preset palette */}
          <div className="grid grid-cols-6 gap-1.5">
            {allowTransparent && (
              <button
                type="button"
                onClick={() => selectColor("transparent")}
                className={`w-7 h-7 rounded-md border transition-transform hover:scale-110 active:scale-95 relative overflow-hidden ${
                  isTransparentValue ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]" : "border-[var(--color-border)]"
                }`}
                style={{ backgroundImage: CHECKER_BG, backgroundSize: "8px 8px" }}
                title={t("layer.transparent")}
              >
                {/* Diagonal line to indicate "none/transparent" */}
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="block w-[130%] h-px bg-red-500 rotate-45" />
                </span>
              </button>
            )}
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => selectColor(color)}
                className={`w-7 h-7 rounded-md border transition-transform hover:scale-110 active:scale-95 ${
                  !isTransparentValue && safeColor.toUpperCase() === color ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]" : "border-[var(--color-border)]"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          {/* Recent colors */}
          <div>
            <span className="text-[10px] text-[var(--color-text-secondary)] block mb-1">{t("cardnews.colorInput.recent")}</span>
            <div className="flex gap-1.5">
              {Array.from({ length: 8 }, (_, idx) => {
                const color = recentColors[idx];
                return color ? (
                  <button
                    key={color}
                    type="button"
                    onClick={() => selectColor(color)}
                    className={`size-5 rounded-md border transition-transform hover:scale-110 active:scale-95 ${
                      !isTransparentValue && safeColor.toUpperCase() === color ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]" : "border-[var(--color-border)]"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ) : (
                  <span key={idx} className="size-5 rounded-md border border-transparent" />
                );
              })}
            </div>
          </div>

          {/* Bottom row: Eyedropper + HEX input */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--color-border)]">
            {"EyeDropper" in globalThis && (
              <button
                type="button"
                onClick={openEyeDropper}
                className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
                title={t("cardnews.colorInput.eyedropper")}
              >
                <Pipette className="w-3.5 h-3.5" />
                <span>{t("cardnews.colorInput.eyedropper")}</span>
              </button>
            )}
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleHexSubmit()}
              placeholder="#000000"
              className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
