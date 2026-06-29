import type {
  CurveElement,
  DiagramElement,
  DiagramLayout,
  ElementRole,
  LineElement,
  TextElement,
} from '../types';
import { BASE_FONT, SMALL_FONT, measureText } from '../measure';

/**
 * Tiny element factories + a finalizer shared by the alternate diagram modes
 * (Dependency, Phrase/Block, Morphology). Each mode builds a flat
 * list of the SAME primitives the Kellogg-Reed engine emits — so the canvas,
 * SVG/PNG export, pan/zoom, and hover popover all work uniformly — then calls
 * `finalize` to normalize the bounding box into view.
 */

let uid = 0;
/** Reset element ids at the start of a layout pass (ids must be unique per layout). */
export function resetIds(): void {
  uid = 0;
}
export const mid = (): string => `m_${uid++}`;

export function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  role: ElementRole,
  style: LineElement['style'] = 'solid',
  extra: Partial<LineElement> = {},
): LineElement {
  return { kind: 'line', id: mid(), x1, y1, x2, y2, style, role, ...extra };
}

export function curve(
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  role: ElementRole,
  style: CurveElement['style'] = 'solid',
  extra: Partial<CurveElement> = {},
): CurveElement {
  return { kind: 'curve', id: mid(), x1, y1, cx, cy, x2, y2, style, role, ...extra };
}

export function text(
  x: number,
  y: number,
  content: string,
  extra: Partial<TextElement> = {},
): TextElement {
  return { kind: 'text', id: mid(), x, y, text: content, anchor: extra.anchor ?? 'middle', ...extra };
}

/** Width of `content` at the main (or small) font, for column layout. */
export function width(content: string, small = false): number {
  return measureText(content, small ? SMALL_FONT : BASE_FONT);
}

/**
 * Shift the assembled elements so the whole drawing sits at (pad, pad) and report
 * the canvas size. Accounts for line endpoints, curve control points, and text
 * extents (approximated generously from the anchor + measured width).
 */
export function finalize(elements: DiagramElement[], pad = 28): DiagramLayout {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const see = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const el of elements) {
    if (el.kind === 'line') {
      see(el.x1, el.y1);
      see(el.x2, el.y2);
    } else if (el.kind === 'curve') {
      see(el.x1, el.y1);
      see(el.cx, el.cy);
      see(el.x2, el.y2);
    } else {
      const w = measureText(el.text, el.small ? SMALL_FONT : BASE_FONT);
      const half = el.anchor === 'middle' ? w / 2 : w;
      const lx = el.anchor === 'end' ? el.x - w : el.x - (el.anchor === 'middle' ? half : 0);
      const rx = el.anchor === 'start' ? el.x + w : el.x + half;
      const fs = el.small ? SMALL_FONT.fontSize : BASE_FONT.fontSize;
      see(lx, el.y - fs);
      see(rx, el.y + fs * 0.3);
    }
  }
  if (!Number.isFinite(minX)) return { width: 2 * pad, height: 2 * pad, elements };
  const dx = pad - minX;
  const dy = pad - minY;
  const moved = elements.map((el) => {
    if (el.kind === 'line') {
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    }
    if (el.kind === 'curve') {
      return {
        ...el,
        x1: el.x1 + dx, y1: el.y1 + dy,
        cx: el.cx + dx, cy: el.cy + dy,
        x2: el.x2 + dx, y2: el.y2 + dy,
      };
    }
    return { ...el, x: el.x + dx, y: el.y + dy };
  });
  return { width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad, elements: moved };
}
