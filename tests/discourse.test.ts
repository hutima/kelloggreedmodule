import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments, sblgntDialect } from '@/io/lowfat';
import {
  DiscourseDocumentSchema,
  DiscoursePatchSchema,
  isEmptyDiscoursePatch,
  type DiscourseDocument,
} from '@/domain/schema';
import {
  acceptDiscourseSuggestion,
  addDiscourseRelation,
  applyDiscoursePatch,
  buildDiscourseDocumentFromKrDocuments,
  buildDiscourseDocumentFromRange,
  canIndent,
  canOutdent,
  childUnits,
  compareRefs,
  createDiscourseBreak,
  deleteDiscourseRelation,
  diffDiscourseDocuments,
  formatRange,
  hashDiscourseBase,
  indentDiscourseUnit,
  labelDiscourseUnit,
  leafUnits,
  mergeAdjacentDiscourseUnits,
  moveDiscourseUnit,
  nestDiscourseUnits,
  normalizeTokenRef,
  outdentDiscourseUnit,
  outlineOrder,
  parseRef,
  rangeOfTitle,
  removeDiscourseBreak,
  splitDiscourseUnit,
  unwrapDiscourseUnit,
  updateDiscourseRelation,
} from '@/domain/discourse';

/**
 * PR 1 acceptance — the discourse schema and pure model layer.
 *
 * Real-source fixtures: SBLGNT Lowfat Ephesians 5:3–33 (20 sentences) and the
 * whole book of Philemon, converted with the production converter, then built
 * into DiscourseDocuments. Discourse structure must be user-authored: the
 * generated base carries units + marker hints + suggestions, but NO relations.
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

function philemonDocs() {
  const xml = readFileSync('tests/fixtures-sblgnt-lowfat-philemon.xml', 'utf8');
  return lowfatToDocuments(xml, {
    book: 'Philemon',
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

function ephesians(): DiscourseDocument {
  return buildDiscourseDocumentFromRange(ephesiansDocs(), {
    ...BUILD_OPTS,
    startRef: '5:3',
    endRef: '5:33',
  });
}

describe('discourse refs', () => {
  it('parses and compares canonical refs', () => {
    expect(parseRef('5:3')).toEqual({ chapter: 5, verse: 3 });
    expect(compareRefs('5:3', '5:33')).toBeLessThan(0);
    expect(compareRefs('4:32', '5:2')).toBeLessThan(0);
    expect(compareRefs('5:3', '5:3')).toBe(0);
  });

  it('normalizes all three source token-ref spellings', () => {
    expect(normalizeTokenRef('EPH 5:3!7')).toBe('5:3');
    expect(normalizeTokenRef('Phil.1.1!2')).toBe('1:1');
    expect(normalizeTokenRef('Phlm.1.12')).toBe('1:12');
    expect(normalizeTokenRef(undefined)).toBe('');
  });

  it('reads title verse ranges, including cross-chapter', () => {
    expect(rangeOfTitle('Ephesians 5:3–5')).toEqual({ start: '5:3', end: '5:5' });
    expect(rangeOfTitle('Ephesians 5:3')).toEqual({ start: '5:3', end: '5:3' });
    expect(rangeOfTitle('Ephesians 4:32–5:2')).toEqual({ start: '4:32', end: '5:2' });
    expect(rangeOfTitle('my own sentence')).toBeNull();
  });

  it('formats range labels', () => {
    expect(formatRange('5:3', '5:33')).toBe('5:3–33');
    expect(formatRange('5:3', '5:3')).toBe('5:3');
    expect(formatRange('4:32', '5:2')).toBe('4:32–5:2');
  });
});

describe('buildDiscourseDocument — Ephesians 5:3–33', () => {
  it('builds a schema-valid document with one unit per sentence', () => {
    const doc = ephesians();
    expect(() => DiscourseDocumentSchema.parse(doc)).not.toThrow();
    const leaves = leafUnits(doc);
    expect(leaves.length).toBe(20);
    expect(doc.range).toEqual({ book: 'Ephesians', startRef: '5:3', endRef: '5:33' });
    expect(doc.title).toBe('Ephesians 5:3–33');
    // Discourse structure is user-authored: the generated base has NO relations.
    expect(doc.relations).toEqual([]);
  });

  it('units carry stable ids, refs, token ids, depth, order, and provenance', () => {
    const doc = ephesians();
    for (const u of leafUnits(doc)) {
      expect(u.id).toMatch(/^du_/);
      expect(u.refStart).toMatch(/^\d+:\d+$/);
      expect(u.refEnd).toMatch(/^\d+:\d+$/);
      expect(u.tokenIds.length).toBeGreaterThan(0);
      expect(u.depth).toBe(0); // single chapter → flat
      expect(u.provenance.source).toBe('given');
    }
    const orders = leafUnits(doc).map((u) => u.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    // Deterministic: building twice yields identical ids and hash.
    const again = ephesians();
    expect(again.units.map((u) => u.id)).toEqual(doc.units.map((u) => u.id));
    expect(hashDiscourseBase(again)).toBe(hashDiscourseBase(doc));
  });

  it('covers every source token exactly once, in reading order', () => {
    const doc = ephesians();
    const covered = leafUnits(doc).flatMap((u) => u.tokenIds);
    expect(covered).toEqual(doc.tokens.map((t) => t.id));
    expect(new Set(covered).size).toBe(covered.length);
  });

  it('detects common discourse markers with hint-grade provenance', () => {
    const doc = ephesians();
    const lemmas = new Set(doc.markers.map((m) => m.lemma));
    expect(lemmas.has('γάρ')).toBe(true); // Eph 5:5, 5:8, 5:9, 5:12, 5:29
    expect(lemmas.has('δέ')).toBe(true);
    expect(lemmas.has('ἵνα')).toBe(true);
    expect(lemmas.has('ἀλλά')).toBe(true);
    for (const m of doc.markers) {
      expect(m.provenance.source).toBe('inferred');
      expect(['medium', 'low']).toContain(m.provenance.confidence);
      expect(m.ref).toMatch(/^\d+:\d+$/);
      expect(m.scopeUnitId).toBeDefined();
      expect(doc.tokens.some((t) => t.id === m.tokenId)).toBe(true);
    }
  });

  it('offers only low/medium-confidence suggestions and commits none of them', () => {
    const doc = ephesians();
    expect(doc.suggestions.length).toBeGreaterThan(0);
    for (const s of doc.suggestions) {
      expect(['low', 'medium']).toContain(s.confidence);
      expect(s.accepted).toBeUndefined();
      expect(s.explanation.length).toBeGreaterThan(0);
    }
    // A γάρ-opening unit suggests a possible ground for its predecessor.
    expect(doc.suggestions.some((s) => s.type === 'possibleGround')).toBe(true);
  });

  it('verse granularity cuts by verse instead of sentence', () => {
    const doc = buildDiscourseDocumentFromRange(ephesiansDocs(), {
      ...BUILD_OPTS,
      startRef: '5:3',
      endRef: '5:33',
      granularity: 'verse',
    });
    const leaves = leafUnits(doc);
    for (const u of leaves) expect(u.refStart).toBe(u.refEnd);
    // The fixture's sentences overlap 5:3–33; verse units cover that span.
    expect(leaves.length).toBeGreaterThanOrEqual(31);
    const covered = leaves.flatMap((u) => u.tokenIds);
    expect(new Set(covered).size).toBe(doc.tokens.length);
  });

  it('round-trips through JSON', () => {
    const doc = ephesians();
    const revived = DiscourseDocumentSchema.parse(JSON.parse(JSON.stringify(doc)));
    expect(revived).toEqual(doc);
  });
});

describe('buildDiscourseDocument — Philemon (whole book)', () => {
  it('converts the whole book into a valid discourse document', () => {
    const docs = philemonDocs();
    const doc = buildDiscourseDocumentFromKrDocuments(docs, {
      ...BUILD_OPTS,
      book: 'Philemon',
    });
    expect(() => DiscourseDocumentSchema.parse(doc)).not.toThrow();
    expect(leafUnits(doc).length).toBe(docs.length);
    expect(doc.tokens.length).toBeGreaterThan(300);
    expect(doc.range.book).toBe('Philemon');
    expect(doc.markers.length).toBeGreaterThan(5);
    expect(doc.relations).toEqual([]);
  });
});

describe('chapter grouping (multi-chapter ranges)', () => {
  it('groups leaves under chapter containers', () => {
    const doc = buildDiscourseDocumentFromKrDocuments(philemonAndFakeChapter(), {
      ...BUILD_OPTS,
      book: 'Test',
    });
    const containers = doc.units.filter((u) => u.kind === 'chapter');
    expect(containers.length).toBe(2);
    for (const leaf of leafUnits(doc)) {
      expect(leaf.parentId).toBeDefined();
      expect(leaf.depth).toBe(1);
    }
    // Outline order interleaves containers before their children.
    const order = outlineOrder(doc).map((u) => u.kind);
    expect(order[0]).toBe('chapter');
  });
});

/** Two tiny synthetic sentence docs in different chapters. */
function philemonAndFakeChapter() {
  const mk = (id: string, title: string, ref: string, words: string[]) => ({
    schemaVersion: 1,
    id,
    title,
    language: 'grc',
    text: words.join(' '),
    tokens: words.map((w, i) => ({
      id: `${id}_t${i}`,
      index: i,
      surface: w,
      morphology: { extra: { ref: `TST ${ref}!${i + 1}` } },
    })),
    syntax: { rootId: `${id}_root`, nodes: [{ id: `${id}_root`, kind: 'clause' as const, tokenIds: [] }], relations: [] },
    layoutHints: {},
    notes: '',
    createdAt: NOW,
    updatedAt: NOW,
  });
  return [
    mk('tst_1', 'Test 1:1', '1:1', ['λόγος', 'ἦν']),
    mk('tst_2', 'Test 2:1', '2:1', ['καὶ', 'φῶς']),
  ];
}

describe('discourse mutations (pure)', () => {
  it('labels a unit', () => {
    const doc = ephesians();
    const target = leafUnits(doc)[0]!;
    const next = labelDiscourseUnit(doc, target.id, 'A', NOW);
    expect(next).not.toBe(doc);
    expect(next.units.find((u) => u.id === target.id)?.label).toBe('A');
    expect(next.units.find((u) => u.id === target.id)?.provenance.source).toBe('manual');
    // Original untouched (pure).
    expect(doc.units.find((u) => u.id === target.id)?.label).toBeUndefined();
  });

  it('splits a unit at a token boundary and merges it back', () => {
    const doc = ephesians();
    const unit = leafUnits(doc).find((u) => u.tokenIds.length > 4)!;
    const at = unit.tokenIds[3]!;
    const split = splitDiscourseUnit(doc, unit.id, at, NOW);
    const first = split.units.find((u) => u.id === unit.id)!;
    const second = split.units.find((u) => u.id === `du_s_${at}`)!;
    expect(first.tokenIds).toEqual(unit.tokenIds.slice(0, 3));
    expect(second.tokenIds).toEqual(unit.tokenIds.slice(3));
    expect(second.order).toBe(first.order + 1);
    expect(second.provenance.source).toBe('manual');
    // Token coverage preserved.
    expect(leafUnits(split).flatMap((u) => u.tokenIds)).toEqual(
      leafUnits(doc).flatMap((u) => u.tokenIds),
    );
    // createDiscourseBreak is the same operation.
    expect(createDiscourseBreak(doc, unit.id, at, NOW).units.length).toBe(split.units.length);

    const merged = mergeAdjacentDiscourseUnits(split, first.id, second.id, NOW);
    expect(merged.units.length).toBe(doc.units.length);
    expect(merged.units.find((u) => u.id === unit.id)?.tokenIds).toEqual(unit.tokenIds);
    // removeDiscourseBreak(second) does the same from the other side.
    const removed = removeDiscourseBreak(split, second.id, NOW);
    expect(removed.units.length).toBe(doc.units.length);
  });

  it('split is a no-op at the start of a unit or for unknown tokens', () => {
    const doc = ephesians();
    const unit = leafUnits(doc)[0]!;
    expect(splitDiscourseUnit(doc, unit.id, unit.tokenIds[0]!, NOW)).toBe(doc);
    expect(splitDiscourseUnit(doc, unit.id, 'nope', NOW)).toBe(doc);
  });

  it('merge only applies to adjacent siblings', () => {
    const doc = ephesians();
    const leaves = leafUnits(doc);
    expect(mergeAdjacentDiscourseUnits(doc, leaves[0]!.id, leaves[2]!.id, NOW)).toBe(doc);
    expect(mergeAdjacentDiscourseUnits(doc, leaves[1]!.id, leaves[0]!.id, NOW)).toBe(doc);
  });

  it('indents and outdents, keeping depth/parent/order consistent', () => {
    const doc = ephesians();
    const leaves = leafUnits(doc);
    const [first, second] = [leaves[0]!, leaves[1]!];
    expect(canIndent(doc, first.id)).toBe(false);
    expect(canIndent(doc, second.id)).toBe(true);

    const indented = indentDiscourseUnit(doc, second.id, NOW);
    const moved = indented.units.find((u) => u.id === second.id)!;
    expect(moved.parentId).toBe(first.id);
    expect(moved.depth).toBe(1);
    expect(childUnits(indented, first.id).map((u) => u.id)).toEqual([second.id]);
    // Old sibling group re-sequenced without gaps.
    const rootOrders = childUnits(indented, undefined).map((u) => u.order);
    expect(rootOrders).toEqual(rootOrders.map((_, i) => i));

    expect(canOutdent(indented, second.id)).toBe(true);
    const outdented = outdentDiscourseUnit(indented, second.id, NOW);
    const back = outdented.units.find((u) => u.id === second.id)!;
    expect(back.parentId).toBeUndefined();
    expect(back.depth).toBe(0);
    // Reinserted directly after its old parent.
    const seq = childUnits(outdented, undefined).map((u) => u.id);
    expect(seq.indexOf(second.id)).toBe(seq.indexOf(first.id) + 1);
  });

  it('indenting builds nested chains without cycles', () => {
    let doc = ephesians();
    const leaves = leafUnits(doc);
    doc = indentDiscourseUnit(doc, leaves[1]!.id, NOW); // 1 under 0
    doc = indentDiscourseUnit(doc, leaves[2]!.id, NOW); // 2 under 0 (prev sibling)
    doc = indentDiscourseUnit(doc, leaves[2]!.id, NOW); // 2 under 1 (prev sibling now 1)
    const byId = new Map(doc.units.map((u) => [u.id, u]));
    expect(byId.get(leaves[1]!.id)!.depth).toBe(1);
    expect(byId.get(leaves[2]!.id)!.depth).toBe(2);
    expect(byId.get(leaves[2]!.id)!.parentId).toBe(leaves[1]!.id);
    // Every parent chain terminates (recomputeDepths would loop otherwise).
    expect(outlineOrder(doc).length).toBe(doc.units.length);
  });

  it('moves a unit among its siblings', () => {
    const doc = ephesians();
    const leaves = leafUnits(doc);
    const next = moveDiscourseUnit(doc, leaves[0]!.id, +1, NOW);
    const seq = childUnits(next, undefined).map((u) => u.id);
    expect(seq[0]).toBe(leaves[1]!.id);
    expect(seq[1]).toBe(leaves[0]!.id);
    expect(moveDiscourseUnit(doc, leaves[0]!.id, -1, NOW)).toBe(doc);
  });

  it('wraps adjacent units in a custom parent and unwraps it again', () => {
    const doc = ephesians();
    const [a, b, c] = leafUnits(doc);
    const wrapped = nestDiscourseUnits(doc, [a!.id, b!.id], { label: 'Warning', id: 'du_test_wrap' }, NOW);
    const wrapper = wrapped.units.find((u) => u.id === 'du_test_wrap')!;
    expect(wrapper.label).toBe('Warning');
    expect(wrapper.kind).toBe('custom');
    expect(wrapper.tokenIds).toEqual([]);
    expect(wrapper.refStart).toBe(a!.refStart);
    expect(wrapper.refEnd).toBe(b!.refEnd);
    expect(childUnits(wrapped, wrapper.id).map((u) => u.id)).toEqual([a!.id, b!.id]);
    expect(wrapped.units.find((u) => u.id === c!.id)?.order).toBe(1); // after the wrapper
    // Non-adjacent selections are refused.
    expect(nestDiscourseUnits(doc, [a!.id, c!.id], {}, NOW)).toBe(doc);

    const unwrapped = unwrapDiscourseUnit(wrapped, wrapper.id, NOW);
    expect(unwrapped.units.some((u) => u.id === wrapper.id)).toBe(false);
    const seq = childUnits(unwrapped, undefined).map((u) => u.id);
    expect(seq.slice(0, 3)).toEqual([a!.id, b!.id, c!.id]);
  });

  it('adds, updates, and deletes user-authored relations', () => {
    const doc = ephesians();
    const [a, b] = leafUnits(doc);
    const withRel = addDiscourseRelation(
      doc,
      { sourceUnitId: b!.id, targetUnitId: a!.id, type: 'ground', id: 'dr_test' },
      NOW,
    );
    const rel = withRel.relations.find((r) => r.id === 'dr_test')!;
    expect(rel.type).toBe('ground');
    expect(rel.provenance.source).toBe('manual');

    const updated = updateDiscourseRelation(withRel, 'dr_test', { type: 'chiasm', label: 'A ↔ A′' }, NOW);
    expect(updated.relations[0]!.type).toBe('chiasm');
    expect(updated.relations[0]!.label).toBe('A ↔ A′');

    const deleted = deleteDiscourseRelation(updated, 'dr_test', NOW);
    expect(deleted.relations).toEqual([]);
    // Self-relations and unknown units are refused.
    expect(addDiscourseRelation(doc, { sourceUnitId: a!.id, targetUnitId: a!.id, type: 'ground' }, NOW)).toBe(doc);
    expect(addDiscourseRelation(doc, { sourceUnitId: 'nope', targetUnitId: a!.id, type: 'ground' }, NOW)).toBe(doc);
  });

  it('accepting a suggestion materializes an editable relation; nothing silent', () => {
    const doc = ephesians();
    const ground = doc.suggestions.find((s) => s.type === 'possibleGround' && s.unitIds.length >= 2)!;
    const accepted = acceptDiscourseSuggestion(doc, ground.id, NOW);
    expect(accepted.suggestions.find((s) => s.id === ground.id)?.accepted).toBe(true);
    const rel = accepted.relations.find((r) => r.id === `dr_${ground.id}`)!;
    expect(rel.type).toBe('ground');
    expect(rel.sourceUnitId).toBe(ground.unitIds[0]);
    expect(rel.targetUnitId).toBe(ground.unitIds[1]);
    expect(rel.provenance.source).toBe('confirmed');
    // Accepting twice is a no-op.
    expect(acceptDiscourseSuggestion(accepted, ground.id, NOW)).toBe(accepted);
  });
});

describe('discourse patch (diff / apply)', () => {
  it('diffs edits into a compact patch and reconstructs the live doc', () => {
    const base = ephesians();
    let live = labelDiscourseUnit(base, leafUnits(base)[0]!.id, 'A', NOW);
    live = labelDiscourseUnit(live, leafUnits(live)[19]!.id, 'A′', NOW);
    live = addDiscourseRelation(
      live,
      { sourceUnitId: leafUnits(live)[0]!.id, targetUnitId: leafUnits(live)[19]!.id, type: 'inclusio', id: 'dr_incl' },
      NOW,
    );
    const unit = leafUnits(live).find((u) => u.tokenIds.length > 4)!;
    live = splitDiscourseUnit(live, unit.id, unit.tokenIds[2]!, NOW);

    const patch = diffDiscourseDocuments(base, live, NOW);
    expect(() => DiscoursePatchSchema.parse(patch)).not.toThrow();
    expect(patch.base.discourseDocId).toBe(base.id);
    expect(patch.base.sourceId).toBe('macula-greek-sblgnt-lowfat');
    expect(patch.base.baseHash).toBe(hashDiscourseBase(base));
    // Compact: only the touched units travel whole; order-only shifts ride as
    // tiny partial updates, not whole-entity copies.
    expect(patch.units.upsert.length).toBeLessThan(8);
    expect(JSON.stringify(patch).length).toBeLessThan(JSON.stringify(base).length / 10);
    expect(patch.relations.upsert.length).toBe(1);

    const reconstructed = applyDiscoursePatch(base, patch);
    expect(reconstructed.units).toEqual(live.units);
    expect(reconstructed.relations).toEqual(live.relations);
    expect(reconstructed.markers).toEqual(live.markers);
    // Idempotent.
    expect(applyDiscoursePatch(base, patch)).toEqual(reconstructed);
  });

  it('records accepted suggestions in the patch and re-applies them', () => {
    const base = ephesians();
    const s = base.suggestions.find((x) => x.type === 'possibleGround')!;
    const live = acceptDiscourseSuggestion(base, s.id, NOW);
    const patch = diffDiscourseDocuments(base, live, NOW);
    expect(patch.acceptedSuggestionIds).toEqual([s.id]);
    const reconstructed = applyDiscoursePatch(base, patch);
    expect(reconstructed.suggestions.find((x) => x.id === s.id)?.accepted).toBe(true);
    expect(reconstructed.relations.length).toBe(1);
  });

  it('an unchanged document diffs to an empty patch', () => {
    const base = ephesians();
    const patch = diffDiscourseDocuments(base, base, NOW);
    expect(isEmptyDiscoursePatch(patch)).toBe(true);
  });

  it('patch round-trips through JSON', () => {
    const base = ephesians();
    const live = labelDiscourseUnit(base, leafUnits(base)[0]!.id, 'A', NOW);
    const patch = diffDiscourseDocuments(base, live, NOW);
    const revived = DiscoursePatchSchema.parse(JSON.parse(JSON.stringify(patch)));
    expect(applyDiscoursePatch(base, revived)).toEqual(applyDiscoursePatch(base, patch));
  });
});
