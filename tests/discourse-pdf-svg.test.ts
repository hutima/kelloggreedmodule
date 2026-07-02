import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import {
  addDiscourseRelation,
  buildDiscourseDocumentFromRange,
  discourseOutlineHtml,
  discourseOutlineSvg,
  labelDiscourseUnit,
  leafUnits,
  setDiscourseUnitNotes,
  type DiscourseDocument,
} from '@/domain/discourse';

/**
 * PDF (print-ready HTML) + SVG (vector) export of the discourse outline.
 * Pure generators, so they are tested directly; the modal wires them to
 * `printHtmlDocument` / a `.svg` download.
 */

const NOW = '2026-01-01T00:00:00.000Z';

function ephesians(): DiscourseDocument {
  const xml = readFileSync('tests/fixtures-sblgnt-lowfat-eph-5-3-33.xml', 'utf8');
  const docs = lowfatToDocuments(xml, {
    book: 'Ephesians',
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
    sourceId: 'macula-greek-sblgnt-lowfat',
  });
  let doc = buildDiscourseDocumentFromRange(docs, {
    sourceId: 'macula-greek-sblgnt-lowfat',
    editionId: 'sblgnt',
    book: 'Ephesians',
    startRef: '5:3',
    endRef: '5:33',
    now: NOW,
  });
  const [a, b] = leafUnits(doc);
  doc = labelDiscourseUnit(doc, a!.id, 'A', NOW);
  doc = setDiscourseUnitNotes(doc, a!.id, 'opening warning', NOW);
  doc = addDiscourseRelation(doc, { id: 'dr_1', sourceUnitId: b!.id, targetUnitId: a!.id, type: 'ground' }, NOW);
  return doc;
}

describe('discourse PDF (print-ready HTML) export', () => {
  it('produces a self-contained, well-formed HTML document', () => {
    const html = discourseOutlineHtml(ephesians());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Ephesians 5:3–33</title>');
    expect(html).toContain('@media print');
    // No external assets (CSP-safe) — no http(s) links or script tags.
    expect(html).not.toMatch(/src=|href=|<script/i);
    // Content is present: label, note, and the relation.
    expect(html).toContain('A —');
    expect(html).toContain('opening warning');
    expect(html).toContain('ground →');
  });

  it('escapes user content', () => {
    let doc = ephesians();
    doc = labelDiscourseUnit(doc, leafUnits(doc)[2]!.id, '<b>x</b>', NOW);
    const html = discourseOutlineHtml(doc);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});

describe('discourse SVG (vector) export', () => {
  it('produces a valid, sized SVG of the outline', () => {
    const svg = discourseOutlineSvg(ephesians());
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toMatch(/height="\d+"/);
    expect(svg).toContain('<text');
    // Title + a heading render as text.
    expect(svg).toContain('Ephesians 5:3');
    expect(svg).toContain('ground →');
    // Balanced-ish: as many closing text tags as opening.
    const open = (svg.match(/<text/g) ?? []).length;
    const close = (svg.match(/<\/text>/g) ?? []).length;
    expect(open).toBe(close);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  it('escapes special characters in SVG text', () => {
    let doc = ephesians();
    doc = labelDiscourseUnit(doc, leafUnits(doc)[3]!.id, 'A & <B>', NOW);
    const svg = discourseOutlineSvg(doc);
    expect(svg).toContain('A &amp; &lt;B&gt;');
  });
});
