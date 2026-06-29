import type {
  KrDocument,
  AlternateReading,
  CustomAssignmentPatch,
  SyntaxOverlayPatch,
} from '@/domain/schema';
import { applyPatch, diffDocuments, hashBase } from '@/domain/patch';

/**
 * Turn a contested-reading SYNTAX OVERLAY into a normal CustomAssignmentPatch so
 * the existing, tested patch engine reconstructs the alternate document. The
 * overlay is just a pre-authored edit — nothing here mutates the base.
 */
export function overlayToPatch(
  base: KrDocument,
  overlay: SyntaxOverlayPatch,
): CustomAssignmentPatch {
  return {
    schemaVersion: 1,
    base: { corpus: 'custom', passageId: base.id, baseHash: hashBase(base) },
    syntaxPatch: overlay,
    createdAt: base.updatedAt,
    updatedAt: base.updatedAt,
  };
}

/**
 * Produce the document to SHOW when previewing an alternate reading. A syntax /
 * punctuation alternate applies its overlay; a semantic-only, textual-variant, or
 * review reading returns the base UNCHANGED (the difference is conveyed by an
 * overlay label or a variant note, never by silently editing the tree/tokens).
 */
export function applyAlternateReadingPreview(
  baseDoc: KrDocument,
  reading: AlternateReading,
): KrDocument {
  if (reading.syntaxPatch) {
    return applyPatch(baseDoc, overlayToPatch(baseDoc, reading.syntaxPatch));
  }
  return baseDoc;
}

/**
 * Only a structural (syntax/punctuation) alternate can be ADOPTED as the user's
 * custom parse. Semantic-only readings change no structure, and textual variants
 * depend on different wording — neither is adopted by editing the base tree.
 */
export function canAdoptAlternateReading(reading: AlternateReading): boolean {
  return Boolean(reading.syntaxPatch) && !reading.textualVariant;
}

/**
 * Convert an adopted alternate into a real, minimal user patch (base → alternate)
 * via the existing diff engine, so adopting flows through the SAME persistence as
 * any manual edit. Returns null when the reading is not structurally adoptable.
 */
export function adoptAlternateReading(
  baseDoc: KrDocument,
  reading: AlternateReading,
  now: string,
): CustomAssignmentPatch | null {
  if (!canAdoptAlternateReading(reading) || !reading.syntaxPatch) return null;
  const alternate = applyPatch(baseDoc, overlayToPatch(baseDoc, reading.syntaxPatch));
  return diffDocuments(
    baseDoc,
    alternate,
    { corpus: 'custom', passageId: baseDoc.id, baseHash: hashBase(baseDoc) },
    now,
  );
}
