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
