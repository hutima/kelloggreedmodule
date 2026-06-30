import type { DiagramLayout, DiagramElement } from '@/domain/layout';
import { measureText, SMALL_FONT, BASE_FONT } from '@/domain/layout/measure';
import { THEME, dashFor, toneColor } from './theme';

/**
 * Pure SVG string serializer. Used by the export layer (SVG/PNG/print) and by
 * tests. The on-screen React canvas draws the same primitives but adds
 * interaction; both consume the layout engine's output, so what you see is what
 * you export.
 */
export interface SvgOptions {
  padding?: number;
  background?: boolean;
  /** Embed font-family inline so standalone .svg files render correctly. */
  standalone?: boolean;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function elementToSvg(el: DiagramElement): string {
  if (el.kind === 'line') {
    const dash = dashFor(el.style);
    const color = el.tentative ? THEME.tentative : el.color ?? THEME.ink;
    return `<line x1="${r(el.x1)}" y1="${r(el.y1)}" x2="${r(el.x2)}" y2="${r(el.y2)}" stroke="${color}" stroke-width="${THEME.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linecap="round" />`;
  }
  if (el.kind === 'curve') {
    const dash = dashFor(el.style);
    const color = el.tentative ? THEME.tentative : el.color ?? THEME.ink;
    const head = el.arrow ? arrowheadPath(el.cx, el.cy, el.x2, el.y2, color) : '';
    return `<path d="M ${r(el.x1)} ${r(el.y1)} Q ${r(el.cx)} ${r(el.cy)} ${r(el.x2)} ${r(el.y2)}" fill="none" stroke="${color}" stroke-width="${THEME.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linecap="round" />${head}`;
  }
  const fill = el.tentative
    ? THEME.tentative
    : el.color ?? toneColor(el.tone) ?? (el.muted ? THEME.muted : THEME.ink);
  const size = el.small ? THEME.smallFontSize : THEME.fontSize;
  const style = el.italic ? ' font-style="italic"' : '';
  const transform = el.rotate ? ` transform="rotate(${r(el.rotate)} ${r(el.x)} ${r(el.y)})"` : '';
  // A label CHIP (Dependency arc tag): a rounded rect behind the text, white
  // fill with the relation's colour as border + text, so the tag reads cleanly
  // over crossing arcs and matches its arc's hue.
  if (el.box) {
    const w = measureText(el.text, el.small ? SMALL_FONT : BASE_FONT);
    const padX = 5;
    const padY = 2.5;
    const bw = w + padX * 2;
    const bh = size * 0.95 + padY * 2;
    const bx = el.anchor === 'middle' ? el.x - bw / 2 : el.anchor === 'end' ? el.x - bw : el.x;
    const by = el.y - size * 0.72 - padY;
    const rect = `<rect x="${r(bx)}" y="${r(by)}" width="${r(bw)}" height="${r(bh)}" rx="4" fill="${THEME.paper}" stroke="${fill}" stroke-width="1" />`;
    return `${rect}<text x="${r(el.x)}" y="${r(el.y)}" text-anchor="${el.anchor}" font-size="${size}" fill="${fill}"${style}${transform}>${escapeXml(el.text)}</text>`;
  }
  // A paper-coloured halo painted UNDER the glyphs masks a line crossing behind a
  // word (e.g. the dashed verb spine through the verbs), so words stay legible
  // without gapping every line. ONLY for upright words: a diagonal word lies
  // ALONG its own slant, so a halo there would erase the slant under its tails
  // (ς, γ). Invisible over the paper-coloured page.
  const halo = el.rotate
    ? ''
    : ` stroke="${THEME.paper}" stroke-width="3" paint-order="stroke" stroke-linejoin="round"`;
  return `<text x="${r(el.x)}" y="${r(el.y)}" text-anchor="${el.anchor}" font-size="${size}" fill="${fill}"${halo}${style}${transform}>${escapeXml(el.text)}</text>`;
}

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A small filled triangle at (x2,y2), pointing along the tangent from (cx,cy). */
function arrowheadPath(cx: number, cy: number, x2: number, y2: number, color: string): string {
  const ang = Math.atan2(y2 - cy, x2 - cx);
  const s = 6;
  const a1 = ang + Math.PI - 0.4;
  const a2 = ang + Math.PI + 0.4;
  const p1 = `${r(x2 + s * Math.cos(a1))} ${r(y2 + s * Math.sin(a1))}`;
  const p2 = `${r(x2 + s * Math.cos(a2))} ${r(y2 + s * Math.sin(a2))}`;
  return `<path d="M ${r(x2)} ${r(y2)} L ${p1} L ${p2} Z" fill="${color}" stroke="none" />`;
}

export function layoutToSvg(layout: DiagramLayout, opts: SvgOptions = {}): string {
  const pad = opts.padding ?? 0;
  const width = layout.width + pad * 2;
  const height = layout.height + pad * 2;
  const bg = opts.background
    ? `<rect width="${r(width)}" height="${r(height)}" fill="${THEME.paper}" />`
    : '';
  const fontAttr = opts.standalone ? ` font-family="${THEME.fontFamily}"` : '';
  // Draw all structural lines/curves first, then every word on top, so a word's
  // paper-coloured halo masks ANY line crossing it — not only lines that happened
  // to be emitted before it (e.g. an apposition stem the layout pushes after its
  // word). Stable partition keeps the relative order within each layer intact.
  const ordered = [
    ...layout.elements.filter((e) => e.kind !== 'text'),
    ...layout.elements.filter((e) => e.kind === 'text'),
  ];
  const body = ordered.map(elementToSvg).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r(width)}" height="${r(height)}" viewBox="0 0 ${r(width)} ${r(height)}"${fontAttr}>
  ${bg}
  <g transform="translate(${pad},${pad})">
  ${body}
  </g>
</svg>`;
}
