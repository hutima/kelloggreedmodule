import type { KrDocument, ContestedSyntaxIssue, AlternateReading } from '@/domain/schema';
import { contestedRegistry } from '@/data/contestedSyntax';
import { contestedRegistrySblgnt } from '@/data/contestedSyntaxSblgnt';

/**
 * Read-only accessors over the contested-syntax registry. The CURATED registry is
 * TWO module constants — the Nestle1904/WLC-anchored `contestedRegistry` and the
 * SBLGNT-anchored `contestedRegistrySblgnt` (mirroring the same curated debates
 * onto SBLGNT's own ids; see `src/data/contestedSyntaxSblgnt.ts`) — each entry
 * matched to a passage by its STABLE document id, so a passage only ever sees the
 * issues authored for ITS OWN edition. On top of both sits a small runtime OVERLAY
 * of USER / LLM-imported variants (a full standalone parse per reading). The
 * overlay is registered by the store when a passage loads (from local storage)
 * and after an import, so every accessor below — and thus the badge, the panel,
 * and the dropdown — surface user variants alongside curated ones without any
 * call site needing to know the difference.
 */

let userIssues: ContestedSyntaxIssue[] = [];
let userReadings: AlternateReading[] = [];

/** Replace the runtime user overlay (issues + full-doc readings). */
export function setUserContested(issues: ContestedSyntaxIssue[], readings: AlternateReading[]): void {
  userIssues = issues;
  userReadings = readings;
}

/** The user overlay currently registered (for persistence / inspection). */
export function getUserContested(): { issues: ContestedSyntaxIssue[]; readings: AlternateReading[] } {
  return { issues: userIssues, readings: userReadings };
}

export function allContestedIssues(): ContestedSyntaxIssue[] {
  return [...contestedRegistry.issues, ...contestedRegistrySblgnt.issues, ...userIssues];
}

export function allAlternateReadings(): AlternateReading[] {
  return [...contestedRegistry.readings, ...contestedRegistrySblgnt.readings, ...userReadings];
}

export function getIssuesForPassage(doc: KrDocument): ContestedSyntaxIssue[] {
  // A cross-sentence-boundary issue (mergePassageIds) attaches to EVERY sentence
  // it spans, so the badge / panel appear on both sides of the boundary (e.g.
  // Romans 9:5 shows on the 9:3–5 sentence and on the doxology sentence alike).
  return allContestedIssues().filter(
    (i) => i.passageId === doc.id || (i.mergePassageIds?.includes(doc.id) ?? false),
  );
}

/**
 * Whether an issue needs its base SENTENCES merged before it can be shown
 * structurally (its affected ids/overlay are authored against the combined
 * document). Cross-boundary readings like Romans 9:5's doxology use this.
 */
export function isMergeIssue(issue: ContestedSyntaxIssue): boolean {
  return (issue.mergePassageIds?.length ?? 0) > 1;
}

export function getIssueById(id: string): ContestedSyntaxIssue | undefined {
  return allContestedIssues().find((i) => i.id === id);
}

export function getAlternateReadings(issueId: string): AlternateReading[] {
  return allAlternateReadings().filter((r) => r.issueId === issueId);
}

export function getReadingById(id: string): AlternateReading | undefined {
  return allAlternateReadings().find((r) => r.id === id);
}

export function getAffectedIds(issue: ContestedSyntaxIssue): {
  tokenIds: string[];
  nodeIds: string[];
  relationIds: string[];
} {
  return {
    tokenIds: issue.affectedTokenIds,
    nodeIds: issue.affectedNodeIds ?? [],
    relationIds: issue.affectedRelationIds ?? [],
  };
}

/** True when the current passage has any contested-syntax data. */
export function hasContestedData(doc: KrDocument): boolean {
  return getIssuesForPassage(doc).length > 0;
}

/**
 * The set of NODE ids an issue touches, resolved against the live doc — its
 * declared `affectedNodeIds`, the nodes owning its `affectedTokenIds`, and the
 * endpoints of its `affectedRelationIds`. Used to highlight the affected words in
 * the base diagram whenever the alternate-readings panel is open (so the debated
 * word is visible even before previewing an alternate).
 */
export function issueAffectedNodeIds(issue: ContestedSyntaxIssue, doc: KrDocument): Set<string> {
  const set = new Set<string>(issue.affectedNodeIds ?? []);
  if (issue.affectedTokenIds.length) {
    const tokenToNode = new Map<string, string>();
    for (const n of doc.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);
    for (const t of issue.affectedTokenIds) {
      const nid = tokenToNode.get(t);
      if (nid) set.add(nid);
    }
  }
  if (issue.affectedRelationIds?.length) {
    const relById = new Map(doc.syntax.relations.map((r) => [r.id, r] as const));
    for (const rid of issue.affectedRelationIds) {
      const r = relById.get(rid);
      if (r) {
        set.add(r.headId);
        set.add(r.dependentId);
      }
    }
  }
  return set;
}
