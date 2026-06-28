import type { KrDocument } from '@/domain/schema';
import { layoutDocument } from '@/domain/layout';
import { layoutToSvg, THEME } from '@/domain/render';
import { downloadBlob, downloadText, slugify } from './download';
import { exportJson } from './json';

/**
 * IMPORT/EXPORT LAYER — JSON, SVG, PNG, and print-friendly rendering. Every
 * export goes through the same layout + render pipeline as the on-screen
 * canvas, so output matches the editor exactly.
 */

export function buildSvg(doc: KrDocument): string {
  const layout = layoutDocument(doc, doc.layoutHints);
  return layoutToSvg(layout, { padding: 16, background: true, standalone: true });
}

export function downloadDocumentJson(doc: KrDocument): void {
  downloadText(exportJson(doc), `${slugify(doc.title)}.json`, 'application/json');
}

export function downloadDocumentSvg(doc: KrDocument): void {
  downloadText(buildSvg(doc), `${slugify(doc.title)}.svg`, 'image/svg+xml');
}

/**
 * Rasterises the SVG to PNG via an offscreen canvas. Returns a promise so
 * callers can await the encode. `scale` controls output resolution.
 */
export async function downloadDocumentPng(doc: KrDocument, scale = 2): Promise<void> {
  const svg = buildSvg(doc);
  const layout = layoutDocument(doc, doc.layoutHints);
  const width = (layout.width + 32) * scale;
  const height = (layout.height + 32) * scale;

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
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to rasterise SVG'));
    };
    img.src = url;
  });
}

/** Opens a print-friendly window containing just the diagram. */
export function printDocument(doc: KrDocument): void {
  const svg = buildSvg(doc);
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${escapeHtml(doc.title)}</title>
<style>
  @page { margin: 1.5cm; }
  body { font-family: ${THEME.fontFamily}; margin: 0; padding: 24px; }
  h1 { font-size: 16px; font-weight: 600; }
  .meta { color: #667; font-size: 12px; margin-bottom: 16px; }
  svg { max-width: 100%; height: auto; }
</style></head>
<body>
  <h1>${escapeHtml(doc.title)}</h1>
  <div class="meta">${escapeHtml(doc.text)}</div>
  ${svg}
  <script>window.onload = () => { window.print(); };</script>
</body></html>`);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}
