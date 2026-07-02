import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import { useDiscourseStore } from '@/state';
import {
  addDiscourseRelation,
  applyDiscoursePatch,
  buildDiscourseDocumentFromRange,
  childUnits,
  deleteDiscourseUnit,
  deleteDiscourseUnits,
  diffDiscourseDocuments,
  discourseOutlineMarkdown,
  leafUnits,
  nestDiscourseUnits,
  outlineOrder,
  type DiscourseDocument,
} from '@/domain/discourse';
import type { DiscourseGranularity } from '@/domain/schema';

/**
 * Stage 2 acceptance — deleting verses / units from the Discourse editor.
 *
 * Deletion is a Discourse-layer edit only: it removes units (and their
 * subtree), cleans up relations / markers / suggestions that referenced them,
 * keeps sibling order + container spans valid, and is undoable and persisted
 * as an ordinary discourse patch. Source tokens (base data) are never touched.
 */

const NOW = '2026-01-01T00:00:00.000Z';

function ephesiansDocs() {
  const xml = readFileSync('tests/fixtures-sblgnt-lowfat-eph-5-3-33.xml', 'utf8');
  return lowfatToDocuments(xml, {
    book: 'Ephesians',
    dialect: sblgntDialect,
    docIdPrefix: 'sblgnt',
    sourceId: 'macula-greek-sblgnt-lowfat',
  });
}

const BUILD_OPTS = {
  sourceId: 'macula-greek-sblgnt-lowfat',
  editionId: 'sblgnt',
  book: 'Ephesians',
  now: NOW,
} as const;

function ephesians(granularity?: DiscourseGranularity): DiscourseDocument {
  return buildDiscourseDocumentFromRange(ephesiansDocs(), {
    ...BUILD_OPTS,
    startRef: '5:3',
    endRef: '5:33',
    granularity,
  });
}

describe('deleteDiscourseUnit (pure)', () => {
  it('removes a single verse unit and resequences siblings without gaps', () => {
    const doc = ephesians('verse');
    const target = leafUnits(doc)[2]!;
    const before = doc.units.length;
    const next = deleteDiscourseUnit(doc, target.id, NOW);

    expect(next).not.toBe(doc);
    expect(next.units.some((u) => u.id === target.id)).toBe(false);
    expect(next.units.length).toBe(before - 1);
    // Sibling orders are contiguous 0..n-1.
    const orders = childUnits(next, undefined).map((u) => u.order);
    expect(orders).toEqual(orders.map((_, i) => i));
    // Source token table (base data) is untouched.
    expect(next.tokens).toBe(doc.tokens);
    // The deleted verse's tokens are no longer referenced by any unit.
    const stillReferenced = new Set(leafUnits(next).flatMap((u) => u.tokenIds));
    for (const tid of target.tokenIds) expect(stillReferenced.has(tid)).toBe(false);
  });

  it('removes a sentence unit and drops it from exports', () => {
    const doc = ephesians();
    const target = leafUnits(doc)[0]!;
    const next = deleteDiscourseUnit(doc, target.id, NOW);
    expect(next.units.some((u) => u.id === target.id)).toBe(false);
    const md = discourseOutlineMarkdown(next, { includeText: true });
    // The deleted unit's surfaces are gone from the outline.
    const surfaces = new Map(doc.tokens.map((t) => [t.id, t.surface]));
    const others = new Set(leafUnits(next).flatMap((u) => u.tokenIds));
    for (const tid of target.tokenIds) {
      const s = surfaces.get(tid)!;
      if (![...others].some((o) => surfaces.get(o) === s)) expect(md.includes(s)).toBe(false);
    }
  });

  it('drops relations that touched the deleted unit', () => {
    const doc = ephesians();
    const [a, b, c] = leafUnits(doc);
    let live = addDiscourseRelation(doc, { id: 'dr_ab', sourceUnitId: a!.id, targetUnitId: b!.id, type: 'ground' }, NOW);
    live = addDiscourseRelation(live, { id: 'dr_cb', sourceUnitId: c!.id, targetUnitId: b!.id, type: 'contrast' }, NOW);
    const next = deleteDiscourseUnit(live, b!.id, NOW);
    // Both relations referenced b → both gone.
    expect(next.relations).toEqual([]);
  });

  it('drops marker chips whose token was deleted', () => {
    const doc = ephesians();
    // Find a unit that owns a detected marker.
    const marker = doc.markers[0]!;
    const owner = leafUnits(doc).find((u) => u.tokenIds.includes(marker.tokenId))!;
    expect(owner).toBeTruthy();
    const next = deleteDiscourseUnit(doc, owner.id, NOW);
    expect(next.markers.some((m) => m.id === marker.id)).toBe(false);
    // Markers on retained units survive.
    for (const m of next.markers) {
      expect(next.units.some((u) => u.tokenIds.includes(m.tokenId))).toBe(true);
    }
  });

  it('drops suggestions that referenced the deleted unit', () => {
    const doc = ephesians();
    const withUnits = doc.suggestions.find((s) => s.unitIds.length > 0)!;
    const targetUnit = withUnits.unitIds[0]!;
    const next = deleteDiscourseUnit(doc, targetUnit, NOW);
    for (const s of next.suggestions) expect(s.unitIds).not.toContain(targetUnit);
  });

  it('deletes a container together with its whole subtree and prunes nothing else', () => {
    const doc = ephesians();
    const [a, b, c] = leafUnits(doc);
    const wrapped = nestDiscourseUnits(doc, [a!.id, b!.id], { id: 'du_grp', label: 'A' }, NOW);
    const next = deleteDiscourseUnits(wrapped, ['du_grp'], NOW);
    // Group + both members gone; c remains.
    expect(next.units.some((u) => u.id === 'du_grp')).toBe(false);
    expect(next.units.some((u) => u.id === a!.id)).toBe(false);
    expect(next.units.some((u) => u.id === b!.id)).toBe(false);
    expect(next.units.some((u) => u.id === c!.id)).toBe(true);
    // Outline stays walkable (no orphaned parents).
    expect(outlineOrder(next).length).toBe(next.units.length);
  });

  it('prunes a container left empty after its only child is deleted', () => {
    const doc = ephesians();
    const [a, b] = leafUnits(doc);
    const wrapped = nestDiscourseUnits(doc, [a!.id], { id: 'du_solo', label: 'Solo' }, NOW);
    expect(wrapped.units.some((u) => u.id === 'du_solo')).toBe(true);
    // Deleting the lone child leaves an empty container → pruned as a side effect.
    const next = deleteDiscourseUnit(wrapped, a!.id, NOW);
    expect(next.units.some((u) => u.id === 'du_solo')).toBe(false);
    expect(next.units.some((u) => u.id === b!.id)).toBe(true);
  });

  it('is a no-op for an unknown unit id', () => {
    const doc = ephesians();
    expect(deleteDiscourseUnit(doc, 'du_nope', NOW)).toBe(doc);
    expect(deleteDiscourseUnits(doc, [], NOW)).toBe(doc);
  });

  it('persists deletion through the patch diff/apply round-trip', () => {
    const base = ephesians();
    const target = leafUnits(base)[3]!;
    const live = deleteDiscourseUnit(base, target.id, NOW);
    const patch = diffDiscourseDocuments(base, live, NOW);
    expect(patch.units.remove).toContain(target.id);
    const reconstructed = applyDiscoursePatch(base, patch);
    expect(reconstructed.units).toEqual(live.units);
    expect(reconstructed.units.some((u) => u.id === target.id)).toBe(false);
  });
});

describe('discourse store — deleteUnit (undo / redo / persistence)', () => {
  beforeEach(() => {
    localStorage.clear();
    useDiscourseStore.setState({
      baseDoc: null,
      doc: null,
      status: 'idle',
      error: null,
      past: [],
      future: [],
      selection: {},
      multiSelectedUnitIds: [],
      sourceId: 'macula-greek-sblgnt-lowfat',
      bookNum: 10,
      startRef: '5:3',
      endRef: '5:33',
      granularity: 'sentence',
    });
  });

  it('deletes the selected unit, undoes and redoes it, and clears stale selection', async () => {
    await useDiscourseStore.getState().loadRange({ bookDocs: ephesiansDocs() });
    const target = leafUnits(useDiscourseStore.getState().doc!)[0]!;
    useDiscourseStore.getState().select({ unitId: target.id });

    useDiscourseStore.getState().deleteUnit(target.id);
    let s = useDiscourseStore.getState();
    expect(s.doc!.units.some((u) => u.id === target.id)).toBe(false);
    expect(s.selection.unitId).toBeUndefined(); // stale selection cleared

    useDiscourseStore.getState().undo();
    s = useDiscourseStore.getState();
    expect(s.doc!.units.some((u) => u.id === target.id)).toBe(true);

    useDiscourseStore.getState().redo();
    s = useDiscourseStore.getState();
    expect(s.doc!.units.some((u) => u.id === target.id)).toBe(false);
  });

  it('persists a deletion across a reload of the same range', async () => {
    await useDiscourseStore.getState().loadRange({ bookDocs: ephesiansDocs() });
    const target = leafUnits(useDiscourseStore.getState().doc!)[0]!;
    useDiscourseStore.getState().deleteUnit(target.id);

    // Fresh session: drop in-memory docs, reload the same range.
    useDiscourseStore.setState({ baseDoc: null, doc: null, status: 'idle', past: [], future: [] });
    await useDiscourseStore.getState().loadRange({ bookDocs: ephesiansDocs() });
    expect(useDiscourseStore.getState().doc!.units.some((u) => u.id === target.id)).toBe(false);
  });
});
