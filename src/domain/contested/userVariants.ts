import { customAlphabet } from 'nanoid';
import type { AlternateReading, ContestedSyntaxIssue, KrDocument } from '@/domain/schema';
import { getNode } from '@/domain/model';

/**
 * USER / LLM-IMPORTED VARIANT READINGS.
 *
 * A curated alternate reading is a PATCH on the base parse (it reuses the base's
 * stable ids). An imported LLM parse has its OWN ids — so it can't be a patch. We
 * therefore represent it as a FULL standalone document carried on the reading
 * (`fullDoc`), grouped under one synthesized "Imported alternate readings" issue
 * per passage. The rest of the contested machinery — the badge, the panel, the
 * dropdown, the side-by-side comparison — then treats it like any other reading.
 */

const rid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

export interface VariantInput {
  /** A short label for the dropdown (e.g. "Participle modifies πίστις"). */
  label: string;
  /** A short exegetical / interpretive impact note. */
  impact?: string;
  /** The full parse for this reading. */
  doc: KrDocument;
}

/** The synthesized issue id that groups a passage's imported variant readings. */
export function userIssueId(passageId: string): string {
  return `iss_user_${passageId}`;
}

/**
 * A "combined" passage is the discourse container the picker builds when several
 * sentences are opened together. A variant attaches to a SINGLE source sentence,
 * so importing-as-variant is blocked while a combined passage is loaded.
 */
export function isCombinedPassage(doc: KrDocument): boolean {
  return getNode(doc.syntax, doc.syntax.rootId)?.clauseType === 'discourse';
}

/**
 * Build the runtime contested overlay (one grouping issue + one full-doc reading
 * per variant) for a passage's imported variants. Pure — the caller persists and
 * registers the result.
 */
export function buildUserVariants(
  passageId: string,
  verseRef: string,
  variants: VariantInput[],
): { issue: ContestedSyntaxIssue; readings: AlternateReading[] } {
  const issueId = userIssueId(passageId);
  const readings: AlternateReading[] = variants.map((v) => ({
    id: `alt_user_${rid()}`,
    issueId,
    passageId,
    label: v.label,
    interpretation: v.impact ?? v.label,
    description: v.impact ?? '',
    sourceType: 'syntax-only',
    origin: 'user',
    confidence: 'medium',
    fullDoc: v.doc,
    ...(v.impact ? { impact: v.impact } : {}),
  }));
  const issue: ContestedSyntaxIssue = {
    id: issueId,
    passageId,
    verseRef,
    kind: 'other',
    sourceType: 'syntax-only',
    severity: 'note',
    label: 'Imported alternate readings',
    shortLabel: 'Imported',
    summary:
      'Alternate parses imported from an LLM (or added by you). Preview each beside the base parse.',
    affectedTokenIds: [],
    defaultReading: {
      label: 'Base parse',
      description: 'The source parse this passage loaded with.',
    },
    alternateReadingIds: readings.map((r) => r.id),
  };
  return { issue, readings };
}

/** Merge freshly-imported variants into any already stored for the passage. */
export function mergeUserVariants(
  existing: { issue: ContestedSyntaxIssue; readings: AlternateReading[] } | null,
  added: { issue: ContestedSyntaxIssue; readings: AlternateReading[] },
): { issue: ContestedSyntaxIssue; readings: AlternateReading[] } {
  if (!existing) return added;
  const readings = [...existing.readings, ...added.readings];
  return {
    issue: { ...existing.issue, alternateReadingIds: readings.map((r) => r.id) },
    readings,
  };
}
