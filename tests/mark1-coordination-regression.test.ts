import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowfatToDocuments } from '@/io/lowfat';
import { layoutForMode } from '@/domain/layout';
import { getNode } from '@/domain/model';

/**
 * MARK 1:19–20 REGRESSION — a word coordinated with a CLAUSE conjunct.
 *
 * "εἶδεν Ἰάκωβον … καὶ Ἰωάνην … καὶ αὐτοὺς … καταρτίζοντας τὰ δίκτυα"
 * ("he saw James … and John … and them mending the nets") — the direct
 * object of εἶδεν is a THREE-way coordination whose first two members are
 * plain words (Ἰάκωβον, Ἰωάνην) and whose third member is a whole
 * participial CLAUSE ("them … mending the nets").
 *
 * The Kellogg-Reed layout engine's word-coordination fork
 * (`layoutCoordination` in `src/domain/layout/engine.ts`) used to gather its
 * members via `wordConjunctRels`, which deliberately EXCLUDES clause
 * dependents (used elsewhere to detect/measure pure word coordination). That
 * exclusion meant a clause conjunct sitting alongside word conjuncts was
 * never routed to `layoutNode` at all — it silently vanished from the
 * diagram instead of getting its own fork arm. Fixed by merging clause
 * conjuncts into the fork's member list (in surface order) inside
 * `layoutCoordination` specifically, without touching `wordConjunctRels`
 * itself (so unrelated word-coordination-detection call sites are unaffected).
 */

const doc = () =>
  lowfatToDocuments(readFileSync('tests/fixtures-lowfat-mark-1-19-20.xml', 'utf8'), {
    book: 'Mark',
  })[0]!;

describe('Mark 1:19–20 fixture (bundled Nestle1904 Lowfat)', () => {
  it('converts to a valid document covering both verses', () => {
    const d = doc();
    expect(d.title).toBe('Mark 1:19–20');
    expect(d.text).toContain('εἶδεν');
    expect(d.text).toContain('καταρτίζοντας');
  });

  it('coordinates Ἰάκωβον with a WORD conjunct (Ἰωάνην) and a CLAUSE conjunct', () => {
    const d = doc();
    const jamesTok = d.tokens.find((t) => t.lemma === 'Ἰάκωβος')!;
    const jamesNode = d.syntax.nodes.find((n) => n.tokenIds.includes(jamesTok.id))!;
    const conjuncts = d.syntax.relations.filter(
      (r) => r.headId === jamesNode.id && r.type === 'conjunct',
    );
    expect(conjuncts.length).toBeGreaterThanOrEqual(2);
    const kinds = conjuncts.map((r) => getNode(d.syntax, r.dependentId)?.kind);
    expect(kinds).toContain('word'); // Ἰωάνην
    expect(kinds).toContain('clause'); // "them … mending the nets"
  });
});

describe('Mark 1:19–20 Kellogg-Reed layout — mixed word/clause coordination', () => {
  it('draws every word of the sentence (the clause conjunct is not dropped)', () => {
    const d = doc();
    const layout = layoutForMode('kellogg-reed', d, d.layoutHints);
    const drawn = new Set(
      layout.elements.filter((e) => e.kind === 'text').map((e) => e.text),
    );
    // Every surface word of the participial "mending the nets" clause must
    // actually appear as a drawn text element — previously this whole clause
    // (7 words) was silently absent from the diagram.
    for (const word of ['αὐτοὺς', 'καταρτίζοντας', 'ἐν', 'τῷ', 'πλοίῳ', 'τὰ', 'δίκτυα']) {
      expect(drawn.has(word), `expected "${word}" to be drawn`).toBe(true);
    }
  });

  it('gives the clause conjunct its own fork arm (a coordination line into it)', () => {
    const d = doc();
    const netsTok = d.tokens.find((t) => t.lemma === 'δίκτυον')!;
    const netsNode = d.syntax.nodes.find((n) => n.tokenIds.includes(netsTok.id))!;
    // The participle node representing the clause (its predicate word).
    const clauseRel = d.syntax.relations.find(
      (r) => r.type === 'directObject' && r.dependentId === netsNode.id,
    )!;
    const participleId = clauseRel.headId;
    const layout = layoutForMode('kellogg-reed', d, d.layoutHints);
    // The participle's own node id should be reachable as a nodeId on some
    // drawn text element (i.e. it was actually laid out, not skipped).
    const nodeIds = new Set(
      layout.elements.filter((e) => e.kind === 'text' && e.nodeId).map((e) => e.nodeId),
    );
    expect(nodeIds.has(participleId)).toBe(true);
  });
});
