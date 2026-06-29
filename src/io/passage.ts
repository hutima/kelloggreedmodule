import type { KrDocument, Relation, SyntaxNode, Token } from '@/domain/schema';
import { KrDocumentSchema, SCHEMA_VERSION } from '@/domain/schema';

/**
 * Combine several GNT sentence documents into one "passage" document so a reader
 * can open any number of checked sentences together. The sentences are held by a
 * single `discourse` root and the layout engine stacks them vertically, each
 * labelled with its verse reference — they are NOT joined as a coordination.
 */

const TS = '2024-01-01T00:00:00.000Z';

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

export function combinePassage(docs: KrDocument[]): KrDocument {
  const valid = docs.filter(Boolean);
  if (valid.length === 0) throw new Error('No sentences to open.');
  if (valid.length === 1) return valid[0]!;

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
  const last = valid[valid.length - 1]!;
  const book = first.title.replace(/\s*\d+:\d+.*$/, '').trim();
  const firstRef = verseOf(first.title); // e.g. "1:1"
  const lastRef = verseOf(last.title); // e.g. "1:3–7" or "1:8"
  let endLabel = lastRef.split(/[–-]/).pop() ?? lastRef; // "7" or "1:8"
  const chap = firstRef.split(':')[0]!;
  if (endLabel.startsWith(`${chap}:`)) endLabel = endLabel.slice(chap.length + 1); // drop redundant chapter
  const range = firstRef === lastRef ? firstRef : `${firstRef}–${endLabel}`;

  return KrDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: `passage_${first.id}_${valid.length}`,
    title: book ? `${book} ${range}` : range,
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
