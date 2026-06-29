import { describe, it, expect, beforeEach } from 'vitest';
import { buildPassagePackage, buildPatch, detectImport } from '@/io/backup';
import { createDocument } from '@/domain/model';
import { emptySermonPrep, type KrDocument } from '@/domain/schema';

const NOW = '2024-01-01T00:00:00.000Z';

function makeBase(): KrDocument {
  const doc = createDocument({ language: 'grc', title: 'John 1:1' }, () => NOW);
  return {
    ...doc,
    tokens: [{ id: 't1', index: 0, surface: 'λόγος' }],
    syntax: {
      rootId: doc.syntax.rootId,
      nodes: [
        { id: doc.syntax.rootId, kind: 'clause', clauseType: 'independent', tokenIds: [] },
        { id: 'n1', kind: 'word', role: 'subject', tokenIds: ['t1'] },
      ],
      relations: [{ id: 'r1', type: 'subject', headId: doc.syntax.rootId, dependentId: 'n1' }],
    },
  };
}

describe('backup / import detection', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('detects a full document', () => {
    const doc = makeBase();
    const res = detectImport(JSON.stringify(doc));
    expect(res.ok).toBe(true);
    expect(res.kind).toBe('document');
  });

  it('detects an assignment diff (patch)', () => {
    const base = makeBase();
    const edited: KrDocument = {
      ...base,
      syntax: {
        ...base.syntax,
        relations: base.syntax.relations.map((r) => ({ ...r, type: 'predicate' as const })),
      },
    };
    const patch = buildPatch(base, edited, 'gnt', NOW);
    const res = detectImport(JSON.stringify(patch));
    expect(res.ok).toBe(true);
    expect(res.kind).toBe('patch');
    expect(res.patch?.base.corpus).toBe('gnt');
  });

  it('detects sermon prep', () => {
    const s = emptySermonPrep('p1', NOW);
    s.notes.push({ id: 'note_1', anchor: { type: 'passage' }, category: 'theology', body: 'x', createdAt: NOW, updatedAt: NOW });
    const res = detectImport(JSON.stringify(s));
    expect(res.ok).toBe(true);
    expect(res.kind).toBe('sermon');
  });

  it('detects a passage package and a backup', () => {
    const base = makeBase();
    const pkg = buildPassagePackage({ doc: base, base, corpus: 'gnt', sermon: emptySermonPrep(base.id, NOW) }, NOW);
    const pres = detectImport(JSON.stringify(pkg));
    expect(pres.ok).toBe(true);
    expect(pres.kind).toBe('package');

    const backup = { schemaVersion: 1, patches: [], sermonPrep: [], exportedAt: NOW };
    const bres = detectImport(JSON.stringify(backup));
    expect(bres.ok).toBe(true);
    expect(bres.kind).toBe('backup');
  });

  it('rejects invalid JSON and unrecognized shapes', () => {
    expect(detectImport('{not json').ok).toBe(false);
    expect(detectImport('{"hello":1}').ok).toBe(false);
  });

  it('a package built with includeFullDocument carries a document copy', () => {
    const base = makeBase();
    const pkg = buildPassagePackage({ doc: base, base, corpus: 'gnt', includeFullDocument: true }, NOW);
    expect(pkg.document).toBeDefined();
    expect(pkg.patch).toBeDefined();
  });
});
