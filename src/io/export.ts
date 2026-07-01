import type { KrDocument } from '@/domain/schema';
import { layoutForMode, type DiagramMode, type LayoutOptions } from '@/domain/layout';
import { layoutToSvg, THEME, type SvgHighlights } from '@/domain/render';
import { downloadBlob, downloadText, slugify } from './download';
import { exportJson } from './json';

/**
 * IMPORT/EXPORT LAYER — JSON, SVG, and PNG rendering. Every export goes through
 * the same layout + render pipeline as the on-screen canvas, so output matches
 * the editor exactly — including the chosen diagram MODE (Kellogg-Reed,
 * Dependency, Morphology…), row spacing (`opts.verticalScale`), and any sermon
 * highlights / contested washes the caller passes in (`highlights`). Defaults
 * to Kellogg-Reed so callers that don't care keep working.
 */

export function buildSvg(
  doc: KrDocument,
  opts: LayoutOptions = {},
  mode: DiagramMode = 'kellogg-reed',
  highlights?: SvgHighlights,
): string {
  const layout = layoutForMode(mode, doc, doc.layoutHints, opts);
  return layoutToSvg(layout, { padding: 16, background: true, standalone: true, highlights });
}

/** The diagram's intrinsic pixel size (including export padding) at scale 1. */
export function documentNaturalSize(
  doc: KrDocument,
  opts: LayoutOptions = {},
  mode: DiagramMode = 'kellogg-reed',
): { width: number; height: number } {
  const layout = layoutForMode(mode, doc, doc.layoutHints, opts);
  return { width: Math.ceil(layout.width + 32), height: Math.ceil(layout.height + 32) };
}

export function downloadDocumentJson(doc: KrDocument): void {
  downloadText(exportJson(doc), `${slugify(doc.title)}.json`, 'application/json');
}

export function downloadDocumentSvg(
  doc: KrDocument,
  opts: LayoutOptions = {},
  mode: DiagramMode = 'kellogg-reed',
  highlights?: SvgHighlights,
): void {
  downloadText(buildSvg(doc, opts, mode, highlights), `${slugify(doc.title)}.svg`, 'image/svg+xml');
}

/**
 * Canvas pixel budget for PNG export. iOS Safari refuses to allocate a canvas
 * above ~16.7M pixels (toBlob then yields null), so exports stay just under.
 */
export const MAX_CANVAS_PIXELS = 16_000_000;

/**
 * Clamps a raster `scale` so `width×height` at that scale stays within the
 * canvas pixel budget, preserving aspect ratio. Pure so the math is testable.
 */
export function clampPngScale(
  width: number,
  height: number,
  scale: number,
  budget: number = MAX_CANVAS_PIXELS,
): number {
  const area = Math.max(1, width * height);
  return Math.min(scale, Math.sqrt(budget / area));
}

/**
 * Rasterises the SVG to PNG via an offscreen canvas. Returns a promise so
 * callers can await the encode. `scale` controls output resolution; it is
 * clamped so the canvas stays within {@link MAX_CANVAS_PIXELS}.
 */
export async function downloadDocumentPng(
  doc: KrDocument,
  scale = 2,
  opts: LayoutOptions = {},
  mode: DiagramMode = 'kellogg-reed',
  highlights?: SvgHighlights,
): Promise<void> {
  const svg = buildSvg(doc, opts, mode, highlights);
  const layout = layoutForMode(mode, doc, doc.layoutHints, opts);
  const naturalWidth = layout.width + 32;
  const naturalHeight = layout.height + 32;
  const effective = clampPngScale(naturalWidth, naturalHeight, scale);
  const width = naturalWidth * effective;
  const height = naturalHeight * effective;

  const blob = await svgToPngBlob(svg, width, height);
  downloadBlob(blob, `${slugify(doc.title)}.png`);
}

function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width);
      canvas.height = Math.ceil(height);
      const cx = canvas.getContext('2d');
      if (!cx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      cx.fillStyle = THEME.paper;
      cx.fillRect(0, 0, canvas.width, canvas.height);
      cx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(
                new Error(
                  'PNG encode failed — the image may be too large for this device; try a smaller width.',
                ),
              ),
        'image/png',
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to rasterise SVG'));
    };
    img.src = url;
  });
}
