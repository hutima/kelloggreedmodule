import type { KrDocument, SyntaxNode, Token } from '@/domain/schema';

/**
 * Structural validator for CONVERTED documents (the normalized app syntax
 * graph — layer 3). Encodes the recurring converter failure modes as reusable
 * checks, so every source's fixtures can be validated the same way instead of
 * passage-by-passage assertions:
 *
 *   errors   — shapes that are always wrong, whatever the source
 *              (dropped/duplicated tokens, dangling relations, unreachable
 *              nodes, fake whole-<wg> tokens, punctuation-only syntax nodes,
 *              predicate-less predications, passive verbs claiming ordinary
 *              accusative direct objects, PP wrappers filed as apposition);
 *   warnings — shapes that are USUALLY wrong but have legitimate readings
 *              (an adjective/numeral heading a noun — real for substantival
 *              adjectives like πρωτότοκος, so never a hard failure).
 *
 * Tests assert `errors` is empty; `warnings` are for eyeballing and for
 * targeted assertions where a passage is known-good.
 */

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const PUNCT_ONLY = /^[\p{P}\p{S}]+$/u;
const VERBAL_POS = new Set(['verb', 'participle', 'infinitive']);
const NOMINAL_POS = new Set(['noun', 'propernoun', 'pronoun']);

/** The verb-argument roles that mark a clause as a real predication. */
const PREDICATION_ROLES = new Set([
  'subject',
  'directObject',
  'indirectObject',
  'predicateNominative',
  'predicateAdjective',
  'objectComplement',
]);

export function validateConvertedDocument(doc: KrDocument): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { nodes, relations, rootId } = doc.syntax;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const tokenById = new Map(doc.tokens.map((t) => [t.id, t]));
  const firstToken = (n: SyntaxNode | undefined): Token | undefined =>
    n?.tokenIds.length ? tokenById.get(n.tokenIds[0]!) : undefined;

  // --- tokens: each appears in exactly one node (none dropped, none duplicated)
  const tokenUse = new Map<string, string[]>();
  for (const n of nodes) {
    for (const t of n.tokenIds) {
      (tokenUse.get(t) ?? tokenUse.set(t, []).get(t)!).push(n.id);
      if (!tokenById.has(t)) errors.push(`node ${n.id} references missing token ${t}`);
    }
  }
  for (const t of doc.tokens) {
    const uses = tokenUse.get(t.id) ?? [];
    if (uses.length === 0 && !PUNCT_ONLY.test(t.surface)) {
      errors.push(`token ${t.id} ("${t.surface}") appears in no syntax node (dropped word)`);
    }
    if (uses.length > 1) {
      errors.push(`token ${t.id} ("${t.surface}") duplicated across nodes ${uses.join(', ')}`);
    }
  }

  // --- fake tokens: a whole <wg>'s text collapsed into one "word"
  for (const t of doc.tokens) {
    if (/\s/.test(t.surface.trim())) {
      errors.push(`token ${t.id} contains whitespace ("${t.surface}") — a collapsed word group?`);
    }
  }

  // --- punctuation-only syntax nodes
  for (const n of nodes) {
    const tok = firstToken(n);
    if (n.tokenIds.length === 1 && tok && PUNCT_ONLY.test(tok.surface)) {
      errors.push(`node ${n.id} is punctuation-only ("${tok.surface}")`);
    }
  }

  // --- relations reference real nodes
  for (const r of relations) {
    for (const [what, id] of [['head', r.headId], ['dependent', r.dependentId], ['labelNode', r.labelNodeId]] as const) {
      if (id && !nodeById.has(id)) errors.push(`relation ${r.id} (${r.type}) has missing ${what} ${id}`);
    }
  }

  // --- reachability: every node reachable from the root, except label nodes
  const children = new Map<string, string[]>();
  for (const r of relations) {
    (children.get(r.headId) ?? children.set(r.headId, []).get(r.headId)!).push(r.dependentId);
  }
  const labelNodes = new Set(relations.map((r) => r.labelNodeId).filter(Boolean) as string[]);
  const reachable = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const c of children.get(id) ?? []) queue.push(c);
  }
  for (const n of nodes) {
    if (!reachable.has(n.id) && !labelNodes.has(n.id)) {
      errors.push(`node ${n.id} is unreachable from the root (and not a connector label)`);
    }
  }

  // --- predications must have a predicate (implied counts — it is a node)
  const outgoing = new Map<string, string[]>();
  for (const r of relations) {
    (outgoing.get(r.headId) ?? outgoing.set(r.headId, []).get(r.headId)!).push(r.type);
  }
  for (const n of nodes) {
    if (n.kind !== 'clause') continue;
    const types = outgoing.get(n.id) ?? [];
    if (types.some((t) => PREDICATION_ROLES.has(t)) && !types.includes('predicate')) {
      errors.push(`clause ${n.id} has verb arguments (${types.join(', ')}) but no predicate`);
    }
  }

  // --- explicit passive + ordinary accusative directObject
  for (const r of relations) {
    if (r.type !== 'directObject') continue;
    const head = firstToken(nodeById.get(r.headId));
    const dep = firstToken(nodeById.get(r.dependentId));
    if (
      head && VERBAL_POS.has(head.pos) && head.morphology?.voice === 'passive' &&
      dep?.morphology?.case === 'accusative'
    ) {
      errors.push(
        `relation ${r.id}: explicitly passive ${head.surface} claims accusative ${dep.surface} as an ordinary directObject`,
      );
    }
  }

  // --- a preposition-headed dependent filed as apposition (PP wrapper fell through)
  for (const r of relations) {
    if (r.type !== 'apposition') continue;
    const dep = firstToken(nodeById.get(r.dependentId));
    if (dep?.pos === 'preposition') {
      errors.push(
        `relation ${r.id}: preposition-headed dependent ("${dep.surface}") filed as apposition — a PP wrapper fall-through`,
      );
    }
  }

  // --- adjective/numeral heading a noun (usually a mis-headed nominal phrase;
  //     legitimately a substantival adjective sometimes, so a WARNING)
  for (const r of relations) {
    if (r.type !== 'apposition' && r.type !== 'adjectival') continue;
    const headNode = nodeById.get(r.headId);
    if (headNode?.kind !== 'word') continue;
    const head = firstToken(headNode);
    const dep = firstToken(nodeById.get(r.dependentId));
    if (head && dep && (head.pos === 'adjective' || head.pos === 'numeral') && NOMINAL_POS.has(dep.pos)) {
      warnings.push(
        `relation ${r.id} (${r.type}): ${head.pos} "${head.surface}" heads ${dep.pos} "${dep.surface}" — check the head choice`,
      );
    }
  }

  return { errors, warnings };
}
