export type FontWarmupReport = {
  loaded: number;
  error: number;
  loading: number;
  unloaded: number;
  resolved: boolean;
  ok: boolean;
};

export type HtmlMeasurement = {
  label: string;
  width: number;
  height: number;
  bg: string;
  bgImage: string;
  elements: Array<Record<string, unknown>>;
};

export type MeasureHtmlOptions = {
  fontCss?: string;
  fontFamilies?: string[];
  label?: string;
  sliceBy?: string | null;
  placeholderClass?: string | null;
  splitSvgParts?: boolean;
  width?: number;
  height?: number;
};

export const EXTRACT: (options: {
  label: string;
  sliceBy: string | null;
  placeholderClass: string | null;
  splitSvgParts: boolean;
}) => HtmlMeasurement | null;
export const WRAP_JS: (label: string) => boolean;
export const FONT_WARMUP_JS: (families: string[]) => Promise<FontWarmupReport>;
export const UNWRAP_JS: (label: string) => void;

export class FontWarmupError extends Error {
  report: FontWarmupReport;
}

export function measureHtmlInIframe(
  html: string,
  options?: MeasureHtmlOptions,
): Promise<HtmlMeasurement>;
