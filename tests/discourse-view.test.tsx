import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import {
  addDiscourseRelation,
  buildDiscourseDocumentFromKrDocuments,
  buildDiscourseDocumentFromRange,
  collapseDiscourseUnit,
  discourseRows,
  labelDiscourseUnit,
  leafUnits,
  nestDiscourseUnits,
  visibleRelationEndpoints,
} from '@/domain/discourse';
import { DIAGRAM_MODES } from '@/domain/layout';
import { useDiscourseStore } from '@/state';
import { DiscourseView } from '@/ui/discourse/DiscourseView';
import { DiscourseUnitBlock } from '@/ui/discourse/DiscourseUnitBlock';

/**
 * PR 3 acceptance — the Discourse visualization and read-only renderer.
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

const ephesians = () =>
  buildDiscourseDocumentFromRange(bookDocs('tests/fixtures-sblgnt-lowfat-eph-5-3-33.xml', 'Ephesians'), {
    sourceId: 'macula-greek-sblgnt-lowfat',
    editionId: 'sblgnt',
    book: 'Ephesians',
    startRef: '5:3',
    endRef: '5:33',
    now: NOW,
  });

const philemon = () =>
  buildDiscourseDocumentFromKrDocuments(bookDocs('tests/fixtures-sblgnt-lowfat-philemon.xml', 'Philemon'), {
    sourceId: 'macula-greek-sblgnt-lowfat',
    editionId: 'sblgnt',
    book: 'Philemon',
    now: NOW,
  });

describe('DiagramMode registry', () => {
  it('offers Discourse in the visualization list', () => {
    const m = DIAGRAM_MODES.find((x) => x.id === 'discourse');
    expect(m?.label).toBe('Discourse');
    expect(m?.description).toBe('Argument flow / discourse structure');
  });
});

describe('discourse view-model (rows + visible relations)', () => {
  it('flattens the outline with visibility from collapsed ancestors', () => {
    let doc = ephesians();
    const [a, b] = leafUnits(doc);
    doc = nestDiscourseUnits(doc, [a!.id, b!.id], { label: 'A', id: 'du_wrap' }, NOW);
    let rows = discourseRows(doc);
    expect(rows.every((r) => r.visible)).toBe(true);
    doc = collapseDiscourseUnit(doc, 'du_wrap', NOW);
    rows = discourseRows(doc);
    const hidden = rows.filter((r) => !r.visible).map((r) => r.unit.id);
    expect(hidden).toEqual([a!.id, b!.id]);
  });

  it('re-anchors a relation into a collapsed group to the visible ancestor', () => {
    let doc = ephesians();
    const leaves = leafUnits(doc);
    doc = nestDiscourseUnits(doc, [leaves[0]!.id, leaves[1]!.id], { id: 'du_wrap' }, NOW);
    doc = addDiscourseRelation(
      doc,
      { sourceUnitId: leaves[0]!.id, targetUnitId: leaves[4]!.id, type: 'ground', id: 'dr_x' },
      NOW,
    );
    doc = collapseDiscourseUnit(doc, 'du_wrap', NOW);
    const endpoints = visibleRelationEndpoints(doc, discourseRows(doc));
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]!.sourceId).toBe('du_wrap'); // anchored to the collapsed wrapper
    expect(endpoints[0]!.targetId).toBe(leaves[4]!.id);
  });
});

describe('DiscourseView (read-only render)', () => {
  afterEach(cleanup);
  beforeEach(() => {
    useDiscourseStore.setState({
      selection: {},
      view: {
        showMarkers: true,
        showRelations: true,
        showLabels: true,
        showSourceText: true,
        showEnglish: false,
        compact: false,
      },
    });
  });

  it('renders Ephesians 5:3–33 as readable blocks with refs, Greek, and marker chips', () => {
    const doc = labelDiscourseUnit(ephesians(), leafUnits(ephesians())[0]!.id, 'A', NOW);
    const html = renderToStaticMarkup(createElement(DiscourseView, { doc }));
    expect(html).toContain('discourse-unit');
    expect(html).toContain('5:3'); // ref labels
    expect(html).toContain('Πορνεία'); // Greek text (Eph 5:3 opens Πορνεία δὲ…)
    expect(html).toContain('discourse-marker-chip'); // marker chips
    expect(html).toContain('>A<'); // the unit label chip
  });

  it('renders whole-book Philemon without crashing', () => {
    const doc = philemon();
    const html = renderToStaticMarkup(createElement(DiscourseView, { doc }));
    expect(html).toContain('discourse-unit');
    // Every leaf sentence unit renders a block.
    const leaves = leafUnits(doc);
    expect(leaves.length).toBeGreaterThan(10);
    expect((html.match(/data-unit-id=/g) ?? []).length).toBe(leaves.length);
  });

  it('marker chips always speak in hints ("possible …"), never conclusions', () => {
    const doc = ephesians();
    const row = discourseRows(doc).find((r) => r.markers.length > 0)!;
    const html = renderToStaticMarkup(
      createElement(DiscourseUnitBlock, {
        row,
        view: useDiscourseStore.getState().view,
        selected: false,
        relationCount: 0,
        registerEl: () => {},
        onSelect: () => {},
      }),
    );
    expect(html).toContain('possible');
    expect(html).not.toContain('detected');
  });

  it('lists relations textually for the selected unit (arcs are never the only reading)', () => {
    let doc = ephesians();
    const leaves = leafUnits(doc);
    doc = labelDiscourseUnit(doc, leaves[0]!.id, 'A', NOW);
    doc = labelDiscourseUnit(doc, leaves[19]!.id, 'A′', NOW);
    doc = addDiscourseRelation(
      doc,
      { sourceUnitId: leaves[0]!.id, targetUnitId: leaves[19]!.id, type: 'chiasm', id: 'dr_c' },
      NOW,
    );
    // Client render (not SSR) so the zustand selection state is live.
    useDiscourseStore.setState({ selection: { unitId: leaves[0]!.id } });
    const { container } = render(createElement(DiscourseView, { doc }));
    const inspector = container.querySelector('.discourse-inspector');
    expect(inspector).toBeTruthy();
    expect(inspector!.textContent).toContain('chiasm');
    expect(inspector!.textContent).toContain('A′');
  });
});
