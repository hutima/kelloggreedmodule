import type { KrDocument, SourceConstituencyNode } from '@/domain/schema';
import { SyntacticRoleSchema } from '@/domain/schema';

/**
 * Structural validator for the PRESERVED source constituency tree (layer 2).
 * The tree must be a faithful record of the published `<wg>` hierarchy —
 * these checks catch it being dropped, corrupted, or quietly rewritten in
 * the app's own vocabulary:
 *
 *   • every word leaf resolves to exactly one REAL document token, and the
 *     leaves cover the tokens 1:1 (no source node dropped, no fake tokens);
 *   • wg nodes have children, word leaves do not;
 *   • node ids are unique;
 *   • no node carries an APP role name — source roles (s/v/vc/o/io/p/adv…)
 *     must never be relabelled into the app's SyntacticRole vocabulary.
 *
 * `assertTreeMatchesWg` goes further for Lowfat sources: it walks the source
 * XML `<wg>` element alongside the captured tree and verifies class, role,
 * rule, head, articular, child count and child ORDER all match — the
 * strongest "captured verbatim" guarantee available.
 */

export interface ConstituencyValidationResult {
  errors: string[];
}

const APP_ROLES = new Set<string>(SyntacticRoleSchema.options);

export function validateSourceConstituency(doc: KrDocument): ConstituencyValidationResult {
  const errors: string[] = [];
  const tree = doc.sourceConstituency;
  if (!tree) return { errors };

  const tokenIds = new Set(doc.tokens.map((t) => t.id));
  const seenIds = new Set<string>();
  const leafTokens: string[] = [];

  const walk = (n: SourceConstituencyNode): void => {
    if (seenIds.has(n.id)) errors.push(`duplicate source node id ${n.id}`);
    seenIds.add(n.id);
    if (n.role && APP_ROLES.has(n.role)) {
      errors.push(`source node ${n.id} carries APP role "${n.role}" — source roles must stay raw`);
    }
    if (n.kind === 'word') {
      if (n.children.length) errors.push(`word leaf ${n.id} has children`);
      if (!n.tokenIds?.length) {
        errors.push(`word leaf ${n.id} resolves to no token`);
      } else {
        for (const t of n.tokenIds) {
          if (!tokenIds.has(t)) errors.push(`word leaf ${n.id} references missing token ${t}`);
          leafTokens.push(t);
        }
      }
    } else {
      if (!n.children.length) errors.push(`wg node ${n.id} has no children`);
      n.children.forEach(walk);
    }
  };
  walk(tree.root);

  // Leaves ↔ tokens must be a bijection: a missing token is a dropped source
  // word; a duplicate is a corrupted merge.
  const counts = new Map<string, number>();
  for (const t of leafTokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const [t, c] of counts) if (c > 1) errors.push(`token ${t} appears in ${c} source leaves`);
  for (const t of tokenIds) {
    if (!counts.has(t)) errors.push(`token ${t} appears in no source leaf (source node dropped?)`);
  }

  return { errors };
}

/** Tree-shape constituents of a Lowfat element (matches the converter's walk). */
function wgConstituents(el: Element): Element[] {
  return Array.from(el.children).filter((c) => {
    const t = c.tagName.toLowerCase();
    return t === 'w' || t === 'wg';
  });
}

/**
 * Verify a captured tree matches its source `<wg>` element node-for-node:
 * kind, class→cat, role, rule, head, articular, and child order. Returns the
 * mismatches (empty = verbatim capture).
 */
export function assertTreeMatchesWg(node: SourceConstituencyNode, el: Element): string[] {
  const errors: string[] = [];
  const walk = (n: SourceConstituencyNode, e: Element, path: string): void => {
    const tag = e.tagName.toLowerCase();
    const expectKind = tag === 'w' ? 'word' : 'wg';
    if (n.kind !== expectKind) errors.push(`${path}: kind ${n.kind} ≠ source <${tag}>`);
    const attr = (a: string) => e.getAttribute(a) ?? undefined;
    if ((n.cat ?? undefined) !== attr('class')) errors.push(`${path}: cat ${n.cat} ≠ class ${attr('class')}`);
    if ((n.role ?? undefined) !== attr('role')) errors.push(`${path}: role ${n.role} ≠ ${attr('role')}`);
    if (n.kind === 'wg' && (n.rule ?? undefined) !== attr('rule')) {
      errors.push(`${path}: rule ${n.rule} ≠ ${attr('rule')}`);
    }
    if ((n.head ?? false) !== (attr('head') === 'true')) errors.push(`${path}: head ${n.head} ≠ ${attr('head')}`);
    if (n.kind === 'wg' && (n.articular ?? false) !== (attr('articular') === 'true')) {
      errors.push(`${path}: articular ${n.articular} ≠ ${attr('articular')}`);
    }
    if (n.kind === 'word') return;
    const kids = wgConstituents(e);
    if (n.children.length !== kids.length) {
      errors.push(`${path}: ${n.children.length} children ≠ source ${kids.length}`);
      return;
    }
    // Child ORDER must match the source exactly.
    n.children.forEach((c, i) => walk(c, kids[i]!, `${path}.${i}`));
  };
  walk(node, el, 'root');
  return errors;
}
