import type { DiagramLayout, DiagramElement } from '@/domain/layout';
import { THEME, dashFor } from './theme';

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
    const color = el.role === 'connector' || el.style !== 'solid' ? THEME.ink : THEME.ink;
    return `<line x1="${r(el.x1)}" y1="${r(el.y1)}" x2="${r(el.x2)}" y2="${r(el.y2)}" stroke="${color}" stroke-width="${THEME.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linecap="round" />`;
  }
  const fill = el.muted ? THEME.muted : THEME.ink;
  const size = el.small ? THEME.smallFontSize : THEME.fontSize;
  const style = el.italic ? ' font-style="italic"' : '';
  const transform = el.rotate ? ` transform="rotate(${r(el.rotate)} ${r(el.x)} ${r(el.y)})"` : '';
  return `<text x="${r(el.x)}" y="${r(el.y)}" text-anchor="${el.anchor}" font-size="${size}" fill="${fill}"${style}${transform}>${escapeXml(el.text)}</text>`;
}

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

export function layoutToSvg(layout: DiagramLayout, opts: SvgOptions = {}): string {
  const pad = opts.padding ?? 0;
  const width = layout.width + pad * 2;
  const height = layout.height + pad * 2;
  const bg = opts.background
    ? `<rect width="${r(width)}" height="${r(height)}" fill="${THEME.paper}" />`
    : '';
  const fontAttr = opts.standalone ? ` font-family="${THEME.fontFamily}"` : '';
  const body = layout.elements.map(elementToSvg).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r(width)}" height="${r(height)}" viewBox="0 0 ${r(width)} ${r(height)}"${fontAttr}>
  ${bg}
  <g transform="translate(${pad},${pad})">
  ${body}
  </g>
</svg>`;
}
