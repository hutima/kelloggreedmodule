import type { KrDocument, ContestedSyntaxIssue, AlternateReading } from '@/domain/schema';
import { contestedRegistry } from '@/data/contestedSyntax';

/**
 * Read-only accessors over the curated contested-syntax registry. Pure; the
 * registry is matched to a passage by its STABLE document id (the same id the
 * loaders mint for a GNT/WLC sentence or a bundled sample).
 */

export function allContestedIssues(): ContestedSyntaxIssue[] {
  return contestedRegistry.issues;
}

export function allAlternateReadings(): AlternateReading[] {
  return contestedRegistry.readings;
}

export function getIssuesForPassage(doc: KrDocument): ContestedSyntaxIssue[] {
  return contestedRegistry.issues.filter((i) => i.passageId === doc.id);
}

export function getIssueById(id: string): ContestedSyntaxIssue | undefined {
  return contestedRegistry.issues.find((i) => i.id === id);
}

export function getAlternateReadings(issueId: string): AlternateReading[] {
  return contestedRegistry.readings.filter((r) => r.issueId === issueId);
}

export function getReadingById(id: string): AlternateReading | undefined {
  return contestedRegistry.readings.find((r) => r.id === id);
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
