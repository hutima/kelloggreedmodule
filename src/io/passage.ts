import type { KrDocument, Relation, SyntaxNode, Token } from '@/domain/schema';
import { KrDocumentSchema, SCHEMA_VERSION } from '@/domain/schema';

/**
 * Combine several GNT sentence documents into one "passage" document so a reader
 * can open any number of checked sentences together. By default the sentences
 * are held by a single `discourse` root and the layout engine stacks them
 * vertically, each labelled with its verse reference — they are NOT joined.
 *
 * With `{ coordinate: true }` (the OpenText source), when the selected sentences
 * are CHAINED by an explicit coordinating conjunction — each one after the first
 * opening with καί / δέ / διό / οὖν … — they are joined on a single coordinate
 * spine, the conjunction riding the bar between them, so the relation between the
 * sentences is shown rather than left implicit in their stacking.
 */

const TS = '2024-01-01T00:00:00.000Z';

/**
 * Coordinating conjunctions (accented lemmas). A sentence opening with one of
 * these is joined to the previous on a coordinate spine; a SUBORDINATING
 * conjunction (ὅτι, ἵνα, ὅπως, ὡς …) is deliberately excluded — it introduces a
 * dependent clause, not a coordinate sibling, so those keep the stacked layout.
 */
const COORD_LEMMAS = new Set(
  [
    'καί', 'δέ', 'ἀλλά', 'ἤ', 'οὐδέ', 'οὔτε', 'τε', 'μηδέ', 'μήτε', 'εἴτε',
    'γάρ', 'οὖν', 'διό', 'ἄρα', 'πλήν', 'διόπερ', 'τοίνυν', 'ὥστε',
    // The same words also surface (e.g. line-initial) with a final-grave accent.
    'καὶ', 'δὲ', 'ἀλλὰ', 'γὰρ',
  ].map((s) => s.normalize('NFC')),
);

/** Strip the book name from a title like "Romans 5:1" → "5:1". */
function verseOf(title: string): string {
  const m = title.match(/(\d+:\d+(?:[–-]\d+)?)\s*$/);
  return m ? m[1]! : title;
}

function prefixDoc(doc: KrDocument, p: string) {
  const id = (s: string) => `${p}${s}`;
  const tokens: Token[] = doc.tokens.map((t) => ({ ...t, id: id(t.id) }));
  const nodes: SyntaxNode[] = doc.syntax.nodes.map((n) => ({
    ...n,
    id: id(n.id),
    tokenIds: n.tokenIds.map(id),
  }));
  const relations: Relation[] = doc.syntax.relations.map((r) => ({
    ...r,
    id: id(r.id),
    headId: id(r.headId),
    dependentId: id(r.dependentId),
  }));
  return { rootId: id(doc.syntax.rootId), tokens, nodes, relations };
}

/**
 * The sentence-initial COORDINATING connector on a document's root clause, if
 * any — the relation that introduces the whole sentence with καί / δέ / διό … .
 * Returns the relation + its connector node so the caller can hoist it onto a
 * coordinate spine. Subordinators are excluded (see COORD_LEMMAS).
 */
function leadingCoordinator(doc: KrDocument): { relId: string; nodeId: string } | undefined {
  const kids = doc.syntax.relations.filter((r) => r.headId === doc.syntax.rootId);
  for (const r of kids) {
    if (r.type !== 'coordinator' && r.type !== 'conjunction') continue;
    const node = doc.syntax.nodes.find((n) => n.id === r.dependentId);
    const tok = node?.tokenIds.length
      ? doc.tokens.find((t) => t.id === node.tokenIds[0])
      : undefined;
    const lemma = (tok?.lemma ?? tok?.surface)?.normalize('NFC');
    if (lemma && COORD_LEMMAS.has(lemma)) return { relId: r.id, nodeId: r.dependentId };
  }
  return undefined;
}

/**
 * Join sentences chained by coordinating conjunctions onto one coordinate spine:
 * each sentence's clause becomes a `conjunct` of a coordinate root, and the
 * conjunction that opens each later sentence is hoisted to a `coordinator` of the
 * root (so it rides the bar between the clauses). Returns null when the chain is
 * not fully coordinated, so the caller can fall back to the stacked layout.
 */
function coordinatePassage(valid: KrDocument[]): KrDocument | null {
  // Every sentence after the first must open with a coordinating conjunction —
  // otherwise the relation between some pair is not an explicit coordination, and
  // forcing a spine would misrepresent it. Fall back to stacking in that case.
  const leads = valid.map((d) => leadingCoordinator(d));
  if (leads.slice(1).some((l) => !l)) return null;

  const rootId = 'coord_root';
  const tokens: Token[] = [];
  const nodes: SyntaxNode[] = [
    { id: rootId, kind: 'clause', clauseType: 'coordinate', tokenIds: [], provenance: { source: 'given', confidence: 'high' } },
  ];
  const relations: Relation[] = [];
  let nextIndex = 0; // GLOBAL surface index, so the spine orders members correctly

  valid.forEach((doc, i) => {
    const pre = prefixDoc(doc, `s${i}_`);
    // Re-index tokens into one monotonic surface stream across all sentences.
    for (const t of pre.tokens) tokens.push({ ...t, index: nextIndex++ });
    nodes.push(...pre.nodes);
    const lead = leads[i];
    const leadRelId = lead ? `s${i}_${lead.relId}` : undefined;
    for (const r of pre.relations) {
      // Hoist this sentence's leading conjunction onto the coordinate root as a
      // coordinator (riding the spine), instead of leaving it inside the clause.
      if (r.id === leadRelId) {
        relations.push({ ...r, type: 'coordinator', headId: rootId });
      } else {
        relations.push(r);
      }
    }
    // The sentence's clause is a coordinate member of the spine.
    relations.push({
      id: `coord_c${i}`,
      type: 'conjunct',
      headId: rootId,
      dependentId: pre.rootId,
      provenance: { source: 'given', confidence: 'high' },
    });
  });

  return KrDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: `coord_${valid[0]!.id}_${valid.length}`,
    title: passageTitle(valid),
    language: valid[0]!.language,
    text: valid.map((d) => `[${verseOf(d.title)}] ${d.text}`).join('  '),
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    layoutHints: {},
    tokens,
    syntax: { rootId, nodes, relations },
  });
}

/** The book + verse-range title for a set of consecutive sentence documents. */
function passageTitle(valid: KrDocument[]): string {
  const first = valid[0]!;
  const last = valid[valid.length - 1]!;
  const book = first.title.replace(/\s*\d+:\d+.*$/, '').trim();
  const firstRef = verseOf(first.title);
  const lastRef = verseOf(last.title);
  let endLabel = lastRef.split(/[–-]/).pop() ?? lastRef;
  const chap = firstRef.split(':')[0]!;
  if (endLabel.startsWith(`${chap}:`)) endLabel = endLabel.slice(chap.length + 1);
  const range = firstRef === lastRef ? firstRef : `${firstRef}–${endLabel}`;
  return book ? `${book} ${range}` : range;
}

export function combinePassage(
  docs: KrDocument[],
  opts: { coordinate?: boolean } = {},
): KrDocument {
  const valid = docs.filter(Boolean);
  if (valid.length === 0) throw new Error('No sentences to open.');
  if (valid.length === 1) return valid[0]!;

  if (opts.coordinate) {
    const coordinated = coordinatePassage(valid);
    if (coordinated) return coordinated;
  }

  const rootId = 'disc_root';
  const tokens: Token[] = [];
  const nodes: SyntaxNode[] = [
    { id: rootId, kind: 'clause', clauseType: 'discourse', tokenIds: [], provenance: { source: 'given', confidence: 'high' } },
  ];
  const relations: Relation[] = [];

  valid.forEach((doc, i) => {
    const pre = prefixDoc(doc, `s${i}_`);
    tokens.push(...pre.tokens);
    for (const n of pre.nodes) {
      if (n.id === pre.rootId) n.label = verseOf(doc.title); // shown above the sentence
      nodes.push(n);
    }
    relations.push(...pre.relations);
    relations.push({
      id: `disc_r${i}`,
      type: 'adjunct',
      headId: rootId,
      dependentId: pre.rootId,
      provenance: { source: 'given', confidence: 'high' },
    });
  });

  const first = valid[0]!;

  return KrDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: `passage_${first.id}_${valid.length}`,
    title: passageTitle(valid),
    language: first.language,
    text: valid.map((d) => `[${verseOf(d.title)}] ${d.text}`).join('  '),
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    layoutHints: {},
    tokens,
    syntax: { rootId, nodes, relations },
  });
}
