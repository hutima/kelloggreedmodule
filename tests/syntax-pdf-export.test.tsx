import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildPrintableSvgHtml, printDocumentPdf, buildSvg } from '@/io';
import { ExportModal } from '@/ui/components/ExportModal';
import { cloneSample } from '@/fixtures';

/**
 * Phase 4/5 — syntax PDF (print-to-PDF) export. The PDF path wraps the SAME SVG
 * the SVG export builds in a self-contained print-ready HTML document; PNG/SVG/
 * JSON are untouched. Pure builders are tested directly; the print helper is
 * exercised with `window.open` stubbed (no real dialog).
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sampleDoc = () => cloneSample('doc_sample_john_1_1a')!;

describe('buildPrintableSvgHtml', () => {
  it('produces a self-contained, print-styled HTML document embedding the SVG', () => {
    const doc = sampleDoc();
    const svg = buildSvg(doc, { verticalScale: 1 }, 'kellogg-reed');
    const html = buildPrintableSvgHtml(svg, { title: doc.title, subtitle: 'John 1:1', date: '2026-07-02' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain(`<title>${doc.title}</title>`);
    expect(html).toContain('@media print');
    expect(html).toContain('John 1:1');
    expect(html).toContain('2026-07-02');
    // The diagram SVG is embedded inline.
    expect(html).toContain('<svg');
    // No EXTERNAL assets (CSP-safe): no <script>, no fetched src/href. (The SVG's
    // xmlns namespace URL is not a fetched asset and is expected.)
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\ssrc=|\shref=/i);
  });

  it('escapes user content in the title', () => {
    const html = buildPrintableSvgHtml('<svg></svg>', { title: 'A <b>x</b> & "y"' });
    expect(html).toContain('A &lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
    expect(html).not.toContain('<b>x</b>');
  });
});

describe('printDocumentPdf (window.open stubbed)', () => {
  function stubWindow() {
    const written: string[] = [];
    const fakeWin = {
      document: { open() {}, write: (s: string) => written.push(s), close() {} },
      focus() {},
      print() {},
    };
    vi.stubGlobal('open', vi.fn(() => fakeWin));
    return written;
  }

  it('opens a print page containing the current diagram and returns true', () => {
    const written = stubWindow();
    const doc = sampleDoc();
    const ok = printDocumentPdf(doc, { verticalScale: 1 }, 'kellogg-reed', undefined, {
      title: doc.title,
      date: '2026-07-02',
    });
    expect(ok).toBe(true);
    expect(written.join('')).toContain('<svg');
    expect(written.join('')).toContain(doc.title);
  });

  it('honours the diagram mode option (dependency vs kellogg-reed differ)', () => {
    const doc = sampleDoc();
    const kr = buildSvg(doc, { verticalScale: 1 }, 'kellogg-reed');
    const dep = buildSvg(doc, { verticalScale: 1 }, 'dependency');
    expect(kr).not.toBe(dep);
  });

  it('returns false when no popup or print target is available', () => {
    vi.stubGlobal('open', vi.fn(() => null));
    // Also make the iframe fallback unavailable by throwing on createElement.
    const orig = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'iframe') throw new Error('no iframe');
      return orig(tag);
    });
    const ok = printDocumentPdf(sampleDoc(), { verticalScale: 1 }, 'kellogg-reed');
    expect(ok).toBe(false);
  });
});

describe('ExportModal offers PNG, SVG, PDF/Print, and JSON', () => {
  it('renders all four export affordances', () => {
    const html = renderToStaticMarkup(
      createElement(ExportModal, {
        doc: sampleDoc(),
        verticalScale: 1,
        mode: 'kellogg-reed',
        onClose: () => {},
      }),
    );
    expect(html).toContain('PNG');
    expect(html).toContain('SVG');
    expect(html).toContain('PDF / Print');
    expect(html).toContain('JSON');
  });
});
