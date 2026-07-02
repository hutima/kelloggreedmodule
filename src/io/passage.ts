import type { KrDocument, Relation, SourceConstituencyNode, SyntaxNode, Token } from '@/domain/schema';
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
 * A compact deterministic fingerprint of the member SELECTION (djb2, as in
 * `hashBase`). The combined document's id keys its patches / notes / sermon prep,
 * so it must differ whenever the selected sentences differ — the first member and
 * the count alone collide (e.g. 1:1+1:2 vs 1:1+1:3 share both).
 */
function selectionHash(docs: KrDocument[]): string {
  const s = docs.map((d) => d.id).join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Strip the book name from a title like "Romans 5:1" → "5:1". */
function verseOf(title: string): string {
  const m = title.match(/(\d+:\d+(?:[–-]\d+)?)\s*$/);
  return m ? m[1]! : title;
}

/**
 * The marker shown above each stacked passage member: its verse reference when
 * the title carries one (scripture — "Romans 5:1" → "5:1"), otherwise a plain
 * 1-based SENTENCE NUMBER. Typed/LLM passages have no verse reference, so a
 * number reads far better than repeating each sentence's opening words.
 */
function memberLabel(doc: KrDocument, index: number): string {
  return /\d+:\d+/.test(doc.title) ? verseOf(doc.title) : String(index + 1);
}

/** Prefix a source-constituency subtree's ids/tokenIds (mirrors prefixDoc). */
function prefixConstituency(n: SourceConstituencyNode, p: string): SourceConstituencyNode {
  return {
    ...n,
    id: `${p}${n.id}`,
    ...(n.tokenIds ? { tokenIds: n.tokenIds.map((t) => `${p}${t}`) } : {}),
    children: n.children.map((c) => prefixConstituency(c, p)),
  };
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
 * The sentence-initial explicit connector on a document's root clause, if any —
 * the relation that introduces the whole sentence (καί / δέ / διό / ἵνα / ὅτι …).
 * Any coordinator- or conjunction-typed root child counts: a chain of sentences
 * each opening with an explicit connector is joined on one spine so the relation
 * is shown, whether the link is coordinating (καί) or subordinating (ἵνα). A
 * sentence with no leading connector (asyndeton) returns undefined, so the chain
 * is not forced.
 */
function leadingConnector(doc: KrDocument): { relId: string; nodeId: string } | undefined {
  const kids = doc.syntax.relations.filter((r) => r.headId === doc.syntax.rootId);
  for (const r of kids) {
    if (r.type !== 'coordinator' && r.type !== 'conjunction') continue;
    const node = doc.syntax.nodes.find((n) => n.id === r.dependentId);
    if (node?.tokenIds.length) return { relId: r.id, nodeId: r.dependentId };
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
  // Every sentence AFTER THE FIRST must open with an explicit connector — that
  // connector is what joins it to the clause before it. If any join is implicit
  // (asyndeton), don't force a spine; fall back to stacking.
  const leads = valid.map((d) => leadingConnector(d));
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
    // Hoist the JOINING connector (every sentence after the first) onto the
    // coordinate root as a coordinator riding the spine bar between the clauses.
    // The FIRST sentence's own lead (e.g. διό) is left inside its clause, where it
    // renders as that clause's introductory connective — so the spine carries one
    // connector per join, never one-per-member (which would read as a correlative).
    const lead = i >= 1 ? leads[i] : undefined;
    const leadRelId = lead ? `s${i}_${lead.relId}` : undefined;
    for (const r of pre.relations) {
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
    id: `coord_${valid[0]!.id}_${valid.length}_${selectionHash(valid)}`,
    title: passageTitle(valid),
    language: valid[0]!.language,
    text: valid.map((d, i) => `[${memberLabel(d, i)}] ${d.text}`).join('  '),
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
  // Typed/LLM passages carry no verse reference — title after the opening
  // sentence rather than splicing every sentence's first words together.
  if (!/\d+:\d+/.test(first.title)) return first.title;
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
  let nextIndex = 0; // GLOBAL surface index, so ordering consumers see one stream

  valid.forEach((doc, i) => {
    const pre = prefixDoc(doc, `s${i}_`);
    // Re-index tokens into one monotonic surface stream across all sentences.
    for (const t of pre.tokens) tokens.push({ ...t, index: nextIndex++ });
    for (const n of pre.nodes) {
      if (n.id === pre.rootId) n.label = memberLabel(doc, i); // shown above the sentence
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

  // Preserve the members' source constituency when every sentence carries one
  // from the SAME source: a synthetic discourse root holds the per-sentence
  // trees, with ids/tokenIds prefixed exactly like the syntax graph's.
  const consts = valid.map((d) => d.sourceConstituency);
  const sourceConstituency =
    consts[0] && consts.every((c) => c && c.sourceId === consts[0]!.sourceId)
      ? {
          sourceId: consts[0].sourceId,
          ...(consts[0].editionId ? { editionId: consts[0].editionId } : {}),
          root: {
            id: 'sc_passage',
            kind: 'wg' as const,
            cat: 'discourse',
            children: valid.map((d, i) => prefixConstituency(d.sourceConstituency!.root, `s${i}_`)),
          },
        }
      : undefined;

  return KrDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: `passage_${first.id}_${valid.length}_${selectionHash(valid)}`,
    title: passageTitle(valid),
    language: first.language,
    text: valid.map((d, i) => `[${memberLabel(d, i)}] ${d.text}`).join('  '),
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    layoutHints: {},
    tokens,
    syntax: { rootId, nodes, relations },
    ...(sourceConstituency ? { sourceConstituency } : {}),
  });
}
