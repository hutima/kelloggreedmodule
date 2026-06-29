import type { KrDocument, Token } from '@/domain/schema';
import { childRelations, getNode } from '@/domain/model';
import type { DiagramElement, DiagramLayout, GrammarTone } from '../types';
import { LAYOUT } from '../constants';
import { curve, finalize, line, resetIds, text, width } from './builder';

/**
 * MORPHOLOGY CLAUSE mode — Greek (or Hebrew) in surface order, grouped by
 * clause, with compact morphology under each word so a learner can see how the
 * FORM signals the function. Case/finite-verb/participle categories are tinted
 * (colour is always paired with the morphology text, never the only cue), and a
 * few agreement/government links are drawn: article→noun, adjective→noun,
 * preposition→object, subject→verb.
 */

const CASE_ABBR: Record<string, string> = {
  nominative: 'nom', genitive: 'gen', dative: 'dat', accusative: 'acc', vocative: 'voc',
};
const NUM_ABBR: Record<string, string> = { singular: 'sg', dual: 'du', plural: 'pl' };
const GEN_ABBR: Record<string, string> = { masculine: 'm', feminine: 'f', neuter: 'n', common: 'c', both: 'c' };
const TENSE_ABBR: Record<string, string> = {
  present: 'pres', imperfect: 'impf', future: 'fut', aorist: 'aor', perfect: 'pf', pluperfect: 'plpf', past: 'past',
};
const VOICE_ABBR: Record<string, string> = { active: 'act', middle: 'mid', passive: 'pass', middlepassive: 'm/p' };
const MOOD_ABBR: Record<string, string> = {
  indicative: 'ind', subjunctive: 'subj', optative: 'opt', imperative: 'impv', infinitive: 'inf', participle: 'ptcp',
};
const PERS_ABBR: Record<string, string> = { first: '1', second: '2', third: '3' };

const j = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' ');

/** Compact morphology string for the token, by part of speech and language. */
function morphLine(tok: Token): string {
  const m = tok.morphology ?? {};
  const ex = m.extra ?? {};
  if (tok.language === 'hbo') {
    if (tok.pos === 'verb' || tok.pos === 'participle') {
      return j(ex.stem, ex.type, m.person && PERS_ABBR[m.person], m.number && NUM_ABBR[m.number], m.gender && GEN_ABBR[m.gender]);
    }
    return j(m.number && NUM_ABBR[m.number], m.gender && GEN_ABBR[m.gender], ex.state);
  }
  if (tok.pos === 'verb') {
    const pn = m.person ? PERS_ABBR[m.person]! + (m.number ? NUM_ABBR[m.number] : '') : undefined;
    return j(m.tense && TENSE_ABBR[m.tense], m.voice && VOICE_ABBR[m.voice], m.mood && MOOD_ABBR[m.mood], pn);
  }
  if (tok.pos === 'participle') {
    return j(m.tense && TENSE_ABBR[m.tense], m.voice && VOICE_ABBR[m.voice], 'ptcp', m.case && CASE_ABBR[m.case], m.number && NUM_ABBR[m.number], m.gender && GEN_ABBR[m.gender]);
  }
  if (tok.pos === 'infinitive') {
    return j(m.tense && TENSE_ABBR[m.tense], m.voice && VOICE_ABBR[m.voice], 'inf');
  }
  return j(m.case && CASE_ABBR[m.case], m.number && NUM_ABBR[m.number], m.gender && GEN_ABBR[m.gender]);
}

function toneOf(tok: Token): GrammarTone | undefined {
  if (tok.pos === 'verb') return 'verb';
  if (tok.pos === 'participle') return 'participle';
  switch (tok.morphology?.case) {
    case 'nominative':
      return 'nominative';
    case 'accusative':
      return 'accusative';
    case 'genitive':
      return 'genitive';
    case 'dative':
      return 'dative';
    case 'vocative':
      return 'vocative';
    default:
      return undefined;
  }
}

const COL_GAP = 18;
const WORD_Y = 0;
const MORPH_Y = WORD_Y + LAYOUT.fontSize + 2;
const GLOSS_Y = MORPH_Y + LAYOUT.smallFontSize + 2;
const CLAUSE_GAP = 64;

export function layoutMorphology(doc: KrDocument): DiagramLayout {
  resetIds();
  const elements: DiagramElement[] = [];
  const tokenToNode = new Map<string, string>();
  for (const n of doc.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);

  // Assign every token to its innermost enclosing clause.
  const clauseOfToken = new Map<string, string>();
  const clauseOrder: string[] = [];
  const seen = new Set<string>();
  const walk = (nodeId: string, current: string) => {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    const node = getNode(doc.syntax, nodeId);
    if (!node) return;
    const cl = node.kind === 'clause' ? nodeId : current;
    if (node.kind === 'clause' && !clauseOrder.includes(cl)) clauseOrder.push(cl);
    for (const t of node.tokenIds) clauseOfToken.set(t, cl);
    for (const r of childRelations(doc.syntax, nodeId)) walk(r.dependentId, cl);
  };
  const root = getNode(doc.syntax, doc.syntax.rootId);
  walk(doc.syntax.rootId, root?.kind === 'clause' ? doc.syntax.rootId : '_');

  // Tokens of each clause, in surface order.
  const byClause = new Map<string, Token[]>();
  for (const tok of [...doc.tokens].sort((a, b) => a.index - b.index)) {
    const cl = clauseOfToken.get(tok.id) ?? '_';
    const list = byClause.get(cl) ?? [];
    list.push(tok);
    byClause.set(cl, list);
  }
  const orderedClauses = [...byClause.keys()].sort((a, b) => {
    const ai = Math.min(...(byClause.get(a) ?? []).map((t) => t.index));
    const bi = Math.min(...(byClause.get(b) ?? []).map((t) => t.index));
    return ai - bi;
  });

  const cell = new Map<string, { x: number; bottom: number }>(); // token id → centre x + row bottom
  let yTop = 0;
  orderedClauses.forEach((cl, ci) => {
    const toks = byClause.get(cl) ?? [];
    if (!toks.length) return;
    if (ci > 0) {
      // a faint divider between clauses
      elements.push(line(-10, yTop - CLAUSE_GAP * 0.5, 600, yTop - CLAUSE_GAP * 0.5, 'baseline', 'dotted'));
    }
    let cx = 0;
    for (const tok of toks) {
      const morph = morphLine(tok);
      const w = Math.max(width(tok.surface), width(morph, true), tok.gloss ? width(tok.gloss, true) : 0, 22);
      const centre = cx + w / 2;
      const nodeId = tokenToNode.get(tok.id);
      elements.push(text(centre, yTop + WORD_Y, tok.surface, { anchor: 'middle', nodeId, tone: toneOf(tok) }));
      if (morph) elements.push(text(centre, yTop + MORPH_Y, morph, { anchor: 'middle', small: true, muted: true }));
      if (tok.gloss) elements.push(text(centre, yTop + GLOSS_Y, tok.gloss, { anchor: 'middle', small: true, muted: true }));
      cell.set(tok.id, { x: centre, bottom: yTop + GLOSS_Y + 6 });
      cx += w + COL_GAP;
    }
    yTop += GLOSS_Y + CLAUSE_GAP;
  });

  // Agreement / government links between tokens in the SAME clause row.
  const firstTok = (nodeId: string): string | undefined => getNode(doc.syntax, nodeId)?.tokenIds[0];
  const predTok = (clauseId: string): string | undefined => {
    const pred = childRelations(doc.syntax, clauseId).find((r) => r.type === 'predicate' || r.type === 'copula');
    return pred ? firstTok(pred.dependentId) : undefined;
  };
  const linkSet = new Set(['determiner', 'adjectival', 'prepositionObject']);
  const drawLink = (aId: string | undefined, bId: string | undefined, label: string) => {
    if (!aId || !bId || aId === bId) return;
    const a = cell.get(aId);
    const b = cell.get(bId);
    if (!a || !b || a.bottom !== b.bottom) return; // only within one row
    const y = a.bottom + 4;
    const dip = Math.min(40, 12 + Math.abs(a.x - b.x) * 0.12);
    const midX = (a.x + b.x) / 2;
    elements.push(curve(a.x, y, midX, y + dip, b.x, y, 'connector', 'dotted'));
    elements.push(text(midX, y + dip + 2, label, { anchor: 'middle', small: true, italic: true, muted: true }));
  };

  for (const r of doc.syntax.relations) {
    if (linkSet.has(r.type)) {
      drawLink(firstTok(r.dependentId), firstTok(r.headId), r.type === 'prepositionObject' ? 'of' : 'agr');
    } else if (r.type === 'subject') {
      // subject → the clause's finite verb
      drawLink(firstTok(r.dependentId), predTok(r.headId), 'subj');
    }
  }

  return finalize(elements);
}
