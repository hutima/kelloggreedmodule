import { z } from 'zod';
import {
  AlternateReadingSchema,
  ContestedSyntaxIssueSchema,
  CustomAssignmentPatchSchema,
  SermonPrepDataSchema,
  type AlternateReading,
  type ContestedSyntaxIssue,
  type CustomAssignmentPatch,
  type KrDocument,
  type SermonPrepData,
} from '@/domain/schema';
import { applyPatch, hashBase } from '@/domain/patch';

/**
 * USER-DATA PERSISTENCE — compact per-passage records stored separately from the
 * base assignments. We store only DIFFS (custom assignment patches) and sermon
 * prep, never a duplicated copy of the (large) base source assignment. These
 * records are small, so localStorage is the right fit (synchronous, simple,
 * survives offline). Everything is Zod-validated on the way out so a corrupt
 * record can never crash the app.
 */

const PATCH_PREFIX = 'kr:patch:';
const SERMON_PREFIX = 'kr:sermon:';

function safeGet(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or disabled — degrade to no persistence */
  }
}

function safeRemove(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// --- custom assignment patches ------------------------------------------------

export function savePatch(passageId: string, patch: CustomAssignmentPatch): void {
  safeSet(PATCH_PREFIX + passageId, JSON.stringify(patch));
}

export function loadPatch(passageId: string): CustomAssignmentPatch | null {
  const raw = safeGet(PATCH_PREFIX + passageId);
  if (!raw) return null;
  try {
    const parsed = CustomAssignmentPatchSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function deletePatch(passageId: string): void {
  safeRemove(PATCH_PREFIX + passageId);
}

/**
 * Reconstruct the live (edited) document for a base: load its stored patch and
 * apply it — but ONLY when the patch was authored against THIS base (its
 * `baseHash` fingerprint matches). A base can legitimately change under a stored
 * patch (a combined passage's base shifts whenever an included sentence's own
 * patch changes), and applying the stale diff would corrupt the new base. On a
 * mismatch the patch is SKIPPED, never deleted — the user's edits stay in
 * storage for the base they belong to — and a warning is logged.
 */
export function applyStoredPatch(base: KrDocument): KrDocument {
  const patch = loadPatch(base.id);
  if (!patch) return base;
  if (patch.base.baseHash && patch.base.baseHash !== hashBase(base)) {
    console.warn(
      `Stored edits for ${base.id} were made against a different base version; showing the base unedited.`,
    );
    return base;
  }
  return applyPatch(base, patch);
}

// --- sermon prep --------------------------------------------------------------

export function saveSermonPrep(passageId: string, data: SermonPrepData): void {
  safeSet(SERMON_PREFIX + passageId, JSON.stringify(data));
}

export function loadSermonPrep(passageId: string): SermonPrepData | null {
  const raw = safeGet(SERMON_PREFIX + passageId);
  if (!raw) return null;
  try {
    const parsed = SermonPrepDataSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function deleteSermonPrep(passageId: string): void {
  safeRemove(SERMON_PREFIX + passageId);
}

// --- user / LLM-imported variant readings ------------------------------------

const VARIANTS_PREFIX = 'kr:variants:';

/** One passage's imported variant readings: a grouping issue + its full-doc readings. */
const UserVariantBundleSchema = z.object({
  issue: ContestedSyntaxIssueSchema,
  readings: z.array(AlternateReadingSchema),
});
export type UserVariantBundle = z.infer<typeof UserVariantBundleSchema>;

export function saveUserVariants(passageId: string, bundle: UserVariantBundle): void {
  safeSet(VARIANTS_PREFIX + passageId, JSON.stringify(bundle));
}

export function loadUserVariants(passageId: string): UserVariantBundle | null {
  const raw = safeGet(VARIANTS_PREFIX + passageId);
  if (!raw) return null;
  try {
    const parsed = UserVariantBundleSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? (parsed.data as { issue: ContestedSyntaxIssue; readings: AlternateReading[] })
      : null;
  } catch {
    return null;
  }
}

export function deleteUserVariants(passageId: string): void {
  safeRemove(VARIANTS_PREFIX + passageId);
}

// --- bulk export / reset ------------------------------------------------------

function keysWithPrefix(prefix: string): string[] {
  if (typeof localStorage === 'undefined') return [];
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) out.push(k);
    }
  } catch {
    /* ignore */
  }
  return out;
}

export interface AllUserData {
  schemaVersion: 1;
  patches: CustomAssignmentPatch[];
  sermonPrep: SermonPrepData[];
  exportedAt: string;
}

export function collectAllUserData(now: string): AllUserData {
  const patches: CustomAssignmentPatch[] = [];
  for (const k of keysWithPrefix(PATCH_PREFIX)) {
    const raw = safeGet(k);
    if (!raw) continue;
    const parsed = CustomAssignmentPatchSchema.safeParse(JSON.parse(raw));
    if (parsed.success) patches.push(parsed.data);
  }
  const sermonPrep: SermonPrepData[] = [];
  for (const k of keysWithPrefix(SERMON_PREFIX)) {
    const raw = safeGet(k);
    if (!raw) continue;
    const parsed = SermonPrepDataSchema.safeParse(JSON.parse(raw));
    if (parsed.success) sermonPrep.push(parsed.data);
  }
  return { schemaVersion: 1, patches, sermonPrep, exportedAt: now };
}

/** Remove ALL local user data (patches, sermon prep, per-passage notes). Does
 *  not touch base source assignments, which are regenerated from source XML. */
export function clearAllUserData(): void {
  for (const k of [
    ...keysWithPrefix(PATCH_PREFIX),
    ...keysWithPrefix(SERMON_PREFIX),
    ...keysWithPrefix('kr:notes:'),
  ]) {
    safeRemove(k);
  }
}
