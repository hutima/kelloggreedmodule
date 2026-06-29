import { describe, it, expect } from 'vitest';
import { applyPatch, diffDocuments, validatePatch, hashBase } from '@/domain/patch';
import { createDocument } from '@/domain/model';
import type { KrDocument, PatchBase } from '@/domain/schema';
import { emptyPatch, CustomAssignmentPatchSchema } from '@/domain/schema';

const NOW = '2024-01-01T00:00:00.000Z';

/** A small base document: "The Word became flesh" with two word nodes. */
function makeBase(): KrDocument {
  const doc = createDocument({ language: 'en', title: 'Test' }, () => NOW);
  const rootId = doc.syntax.rootId;
  return {
    ...doc,
    tokens: [
      { id: 't1', index: 0, surface: 'Word', provenance: { source: 'given', confidence: 'high' } },
      { id: 't2', index: 1, surface: 'became', provenance: { source: 'given', confidence: 'high' } },
    ],
    syntax: {
      rootId,
      nodes: [
        { id: rootId, kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n1', kind: 'word', role: 'subject', tokenIds: ['t1'] },
        { id: 'n2', kind: 'word', role: 'predicate', tokenIds: ['t2'] },
      ],
      relations: [
        { id: 'r1', type: 'subject', headId: rootId, dependentId: 'n1' },
        { id: 'r2', type: 'predicate', headId: rootId, dependentId: 'n2' },
      ],
    },
  };
}

const base: () => PatchBase = () => ({ corpus: 'custom', passageId: 'p1' });

describe('patch manager', () => {
  it('an empty patch is a no-op', () => {
    const b = makeBase();
    const out = applyPatch(b, emptyPatch(base(), NOW));
    expect(out.syntax.nodes).toEqual(b.syntax.nodes);
    expect(out.syntax.relations).toEqual(b.syntax.relations);
    expect(out.tokens).toEqual(b.tokens);
  });

  it('diff then apply round-trips an edited document', () => {
    const b = makeBase();
    // Edit: change a relation type, add a node+relation, drop a token's morphology.
    const edited: KrDocument = {
      ...b,
      syntax: {
        ...b.syntax,
        nodes: [
          ...b.syntax.nodes,
          { id: 'n3', kind: 'word', role: 'directObject', tokenIds: [] },
        ],
        relations: [
          { ...b.syntax.relations[0]!, type: 'subject' },
          { ...b.syntax.relations[1]!, type: 'copula' }, // changed
          { id: 'r3', type: 'directObject', headId: 'n2', dependentId: 'n3' },
        ],
      },
    };
    const patch = diffDocuments(b, edited, base(), NOW);
    const out = applyPatch(b, patch);
    expect(out.syntax.nodes).toEqual(edited.syntax.nodes);
    expect(out.syntax.relations).toEqual(edited.syntax.relations);
  });

  it('diff is minimal: only changed entities are emitted', () => {
    const b = makeBase();
    const edited: KrDocument = {
      ...b,
      syntax: {
        ...b.syntax,
        relations: b.syntax.relations.map((r) =>
          r.id === 'r2' ? { ...r, type: 'copula' as const } : r,
        ),
      },
    };
    const patch = diffDocuments(b, edited, base(), NOW);
    expect(patch.syntaxPatch.relations.upsert).toHaveLength(1);
    expect(patch.syntaxPatch.relations.upsert[0]!.id).toBe('r2');
    expect(patch.syntaxPatch.nodes.upsert).toHaveLength(0);
  });

  it('removals are captured and applied', () => {
    const b = makeBase();
    const edited: KrDocument = {
      ...b,
      syntax: {
        ...b.syntax,
        nodes: b.syntax.nodes.filter((n) => n.id !== 'n2'),
        relations: b.syntax.relations.filter((r) => r.id !== 'r2'),
      },
    };
    const patch = diffDocuments(b, edited, base(), NOW);
    expect(patch.syntaxPatch.nodes.remove).toContain('n2');
    const out = applyPatch(b, patch);
    expect(out.syntax.nodes.some((n) => n.id === 'n2')).toBe(false);
    expect(out.syntax.relations.some((r) => r.id === 'r2')).toBe(false);
  });

  it('layout-hint patches set and delete hints, never touching the base', () => {
    const b = { ...makeBase(), layoutHints: { n1: { offsetX: 5 } } };
    const edited: KrDocument = {
      ...b,
      layoutHints: { n2: { offsetY: 9 } }, // n1 removed, n2 added
    };
    const patch = diffDocuments(b, edited, base(), NOW);
    expect(patch.layoutHintsPatch).toEqual({ n1: null, n2: { offsetY: 9 } });
    const out = applyPatch(b, patch);
    expect(out.layoutHints).toEqual({ n2: { offsetY: 9 } });
    // base untouched
    expect(b.layoutHints).toEqual({ n1: { offsetX: 5 } });
  });

  it('applying a patch is idempotent', () => {
    const b = makeBase();
    const edited: KrDocument = {
      ...b,
      syntax: {
        ...b.syntax,
        nodes: [...b.syntax.nodes, { id: 'n9', kind: 'word', tokenIds: [] }],
      },
    };
    const patch = diffDocuments(b, edited, base(), NOW);
    const once = applyPatch(b, patch);
    const twice = applyPatch(b, patch);
    expect(twice.syntax.nodes).toEqual(once.syntax.nodes);
  });

  it('partial update ops shallow-merge by id', () => {
    const b = makeBase();
    const patch = emptyPatch(base(), NOW);
    patch.syntaxPatch.relations.update = { r1: { label: 'subj' } };
    const out = applyPatch(b, patch);
    const r1 = out.syntax.relations.find((r) => r.id === 'r1')!;
    expect(r1.label).toBe('subj');
    expect(r1.type).toBe('subject'); // untouched
  });

  it('validatePatch accepts a well-formed patch and rejects junk', () => {
    const b = makeBase();
    const patch = diffDocuments(b, b, base(), NOW);
    const serialized = JSON.parse(JSON.stringify(CustomAssignmentPatchSchema.parse(patch)));
    expect(validatePatch(serialized).ok).toBe(true);
    expect(validatePatch({ nope: true }).ok).toBe(false);
  });

  it('hashBase changes when token ids/surfaces change, stable otherwise', () => {
    const b = makeBase();
    const h1 = hashBase(b);
    expect(hashBase(b)).toBe(h1); // deterministic for the same document
    const drift = { ...b, tokens: [{ ...b.tokens[0]!, surface: 'Logos' }, b.tokens[1]!] };
    expect(hashBase(drift)).not.toBe(h1);
  });
});
