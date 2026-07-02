import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import {
  addDiscourseRelation,
  buildDiscourseDocumentFromKrDocuments,
  buildDiscourseDocumentFromRange,
  diffDiscourseDocuments,
  discourseDocumentJson,
  discourseOutlineMarkdown,
  discoursePatchJson,
  discourseRelationsCsv,
  discourseRelationsMarkdown,
  labelDiscourseUnit,
  leafUnits,
  setDiscourseUnitNotes,
  discourseRows,
} from '@/domain/discourse';
import { DiscourseDocumentSchema, DiscoursePatchSchema } from '@/domain/schema';
import { DiscourseView } from '@/ui/discourse/DiscourseView';
import { useDiscourseStore } from '@/state';

/**
 * PR 6 acceptance — whole-book performance shape, outline navigation data,
 * and the text exports (JSON document/patch, Markdown outline, relation
 * table). Uses the real SBLGNT fixtures incl. Romans 9–11 (103 sentences).
 */

const NOW = '2026-01-01T00:00:00.000Z';

function bookDocs(fixture: string, book: string) {
  const xml = readFileSync(fixture, 'utf8');
  return lowfatToDocuments(xml, {
    book,
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
    sourceId: 'macula-greek-sblgnt-lowfat',
  });
}

const OPTS = { sourceId: 'macula-greek-sblgnt-lowfat', editionId: 'sblgnt', now: NOW } as const;

const ephesians = () =>
  buildDiscourseDocumentFromRange(bookDocs('tests/fixtures-sblgnt-lowfat-eph-5-3-33.xml', 'Ephesians'), {
    ...OPTS,
    book: 'Ephesians',
    startRef: '5:3',
    endRef: '5:33',
  });

describe('Romans 9–11 (large range)', () => {
  it('builds and renders without freezing, grouped by chapter', () => {
    const t0 = performance.now();
    const doc = buildDiscourseDocumentFromKrDocuments(bookDocs('tests/fixtures-sblgnt-lowfat-rom-9-11.xml', 'Romans'), {
      ...OPTS,
      book: 'Romans',
    });
    const built = performance.now() - t0;
    expect(() => DiscourseDocumentSchema.parse(doc)).not.toThrow();
    expect(leafUnits(doc).length).toBe(103);
    const chapters = doc.units.filter((u) => u.kind === 'chapter');
    expect(chapters.map((c) => c.label)).toEqual(['Chapter 9', 'Chapter 10', 'Chapter 11']);
    expect(built).toBeLessThan(5000);

    const t1 = performance.now();
    const html = renderToStaticMarkup(createElement(DiscourseView, { doc }));
    expect(performance.now() - t1).toBeLessThan(5000);
    expect(html).toContain('Chapter 9');
  });

  it('whole-book-scale ranges open with chapters collapsed', () => {
    // Whole-book scale (>200 sentence units) without a megabyte fixture:
    // synthetic tiny sentence docs across 8 chapters.
    const synthetic = Array.from({ length: 240 }, (_, i) => {
      const c = Math.floor(i / 30) + 1;
      const v = (i % 30) + 1;
      const id = `syn_${i}`;
      return {
        schemaVersion: 1,
        id,
        title: `Bigbook ${c}:${v}`,
        language: 'grc',
        text: 'λόγος',
        tokens: [
          { id: `${id}_t0`, index: 0, surface: 'λόγος', morphology: { extra: { ref: `BIG ${c}:${v}!1` } } },
        ],
        syntax: { rootId: `${id}_r`, nodes: [{ id: `${id}_r`, kind: 'clause' as const, tokenIds: [] }], relations: [] },
        layoutHints: {},
        notes: '',
        createdAt: NOW,
        updatedAt: NOW,
      };
    });
    const doc = buildDiscourseDocumentFromKrDocuments(synthetic, { ...OPTS, book: 'Bigbook' });
    expect(leafUnits(doc).length).toBeGreaterThan(200);
    for (const c of doc.units.filter((u) => u.kind === 'chapter')) {
      expect(c.collapsed).toBe(true);
    }
    // Collapsed containers hide their rows — the initial render mounts only
    // the visible handful.
    const visible = discourseRows(doc).filter((r) => r.visible);
    expect(visible.length).toBeLessThan(10);
    // Explicitly clear any store selection state leaking between test files.
    useDiscourseStore.setState({ selection: {} });
    const html = renderToStaticMarkup(createElement(DiscourseView, { doc }));
    expect((html.match(/data-unit-id=/g) ?? []).length).toBeLessThan(10);
  });
});

describe('discourse exports', () => {
  it('exports Ephesians 5:3–33 to schema-valid JSON', () => {
    const doc = ephesians();
    const json = discourseDocumentJson(doc);
    expect(() => DiscourseDocumentSchema.parse(JSON.parse(json))).not.toThrow();
  });

  it('exports the Markdown outline with labels, refs, text, notes, relations', () => {
    let doc = ephesians();
    const leaves = leafUnits(doc);
    doc = labelDiscourseUnit(doc, leaves[0]!.id, 'A', NOW);
    doc = labelDiscourseUnit(doc, leaves[19]!.id, 'A′', NOW);
    doc = setDiscourseUnitNotes(doc, leaves[0]!.id, 'Opening warning.', NOW);
    doc = addDiscourseRelation(
      doc,
      { sourceUnitId: leaves[0]!.id, targetUnitId: leaves[19]!.id, type: 'inclusio', id: 'dr_i', label: 'A ↔ A′' },
      NOW,
    );
    const md = discourseOutlineMarkdown(doc);
    expect(md).toContain('# Ephesians 5:3–33');
    expect(md).toContain('**A — Eph 5:3–4**');
    expect(md).toContain('Πορνεία'); // source text included by default
    expect(md).toContain('Note: Opening warning.');
    expect(md).toContain('Relation: inclusio →');
    expect(md).toContain('(A ↔ A′)');
    expect(md).toContain('user-authored discourse analysis');
    // Text can be omitted.
    expect(discourseOutlineMarkdown(doc, { includeText: false })).not.toContain('Πορνεία');
  });

  it('exports the relation table as Markdown and CSV', () => {
    let doc = ephesians();
    const leaves = leafUnits(doc);
    doc = addDiscourseRelation(
      doc,
      { sourceUnitId: leaves[1]!.id, targetUnitId: leaves[0]!.id, type: 'ground', id: 'dr_g', confidence: 'medium' },
      NOW,
    );
    const md = discourseRelationsMarkdown(doc);
    expect(md).toContain('Type | Source | Target');
    expect(md).toContain('ground');
    const csv = discourseRelationsCsv(doc);
    expect(csv.split('\n')[0]).toBe('id,type,source,target,label,confidence,provenance,notes');
    expect(csv).toContain('"dr_g","ground"');
    expect(csv).toContain('"medium"');
  });

  it('exports the edit patch as schema-valid JSON', () => {
    const base = ephesians();
    const live = labelDiscourseUnit(base, leafUnits(base)[0]!.id, 'A', NOW);
    const json = discoursePatchJson(diffDiscourseDocuments(base, live, NOW));
    expect(() => DiscoursePatchSchema.parse(JSON.parse(json))).not.toThrow();
    expect(JSON.parse(json).base.discourseDocId).toBe(base.id);
  });
});
