import type { HighlightCategory, SermonAnchor, KrDocument, Highlight } from '@/domain/schema';
import { getNode, getRelation, nodeText } from '@/domain/model';

/** Highlight categories with a short label and a swatch colour. */
export const HIGHLIGHT_CATEGORIES: { id: HighlightCategory; label: string; color: string }[] = [
  { id: 'mainIdea', label: 'Main idea', color: '#fde047' },
  { id: 'repeatedWord', label: 'Repeated', color: '#a7f3d0' },
  { id: 'command', label: 'Command', color: '#fca5a5' },
  { id: 'promise', label: 'Promise', color: '#bfdbfe' },
  { id: 'warning', label: 'Warning', color: '#fdba74' },
  { id: 'theologicalClaim', label: 'Theology', color: '#c4b5fd' },
  { id: 'illustration', label: 'Illustration', color: '#f9a8d4' },
  { id: 'application', label: 'Application', color: '#86efac' },
  { id: 'question', label: 'Question', color: '#e9d5ff' },
  { id: 'contrast', label: 'Contrast', color: '#fed7aa' },
  { id: 'conjunction', label: 'Conjunction', color: '#d9f99d' },
  { id: 'emphasis', label: 'Emphasis', color: '#fef08a' },
];

export function highlightColor(category: HighlightCategory): string {
  return HIGHLIGHT_CATEGORIES.find((c) => c.id === category)?.color ?? '#fde047';
}

/**
 * Build a `nodeId → highlight colour` lookup from the sermon highlights so every
 * view (diagram + running text) can paint a tagged word in its category colour.
 * A node/block anchor maps directly; the most recently added highlight wins when
 * a node carries several. Relation/passage highlights aren't word-level and are
 * skipped here.
 */
export function nodeHighlightColors(highlights: Highlight[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const h of highlights) {
    const nodeId = h.anchor.nodeId ?? h.anchor.blockId;
    if (nodeId) colors.set(nodeId, highlightColor(h.category));
  }
  return colors;
}

/** Human label for an anchor (for the sermon lists). */
export function describeAnchor(doc: KrDocument, anchor: SermonAnchor): string {
  if (anchor.nodeId) {
    const n = getNode(doc.syntax, anchor.nodeId);
    return n ? nodeText(doc, n) || n.label || n.kind : 'word';
  }
  if (anchor.relationId) {
    const r = getRelation(doc.syntax, anchor.relationId);
    return r ? `relation (${r.type})` : 'relation';
  }
  if (anchor.verseRef) return anchor.verseRef;
  if (anchor.tokenIds?.length) return `${anchor.tokenIds.length} word(s)`;
  return 'passage';
}
