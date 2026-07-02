import {
  DiscoursePatchSchema,
  type DiscourseDocument,
  type DiscoursePatch,
} from '@/domain/schema';
import { applyDiscoursePatch, hashDiscourseBase } from '@/domain/discourse';

/**
 * DISCOURSE PERSISTENCE — compact per-range patch records, kept in their OWN
 * localStorage namespace, fully separate from syntax patches (`kr:patch:*`),
 * sermon prep (`kr:sermon:*`), notes (`kr:notes:*`), and contested overlays.
 * Only DIFFS are stored — the base discourse document is regenerated from the
 * source book XML on load. Everything is Zod-validated on the way out so a
 * corrupt record can never crash the app.
 *
 * Keys embed the generated base document id, which itself encodes
 * `sourceId + book + range + granularity` — so a patch can never silently
 * cross source editions or ranges. A `baseHash` guards source drift.
 */

const DISCOURSE_PATCH_PREFIX = 'kr:discourse:';
const LAST_RANGE_KEY = 'kr:lastDiscourse';

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

// --- discourse patches ---------------------------------------------------------

export function saveDiscoursePatch(discourseDocId: string, patch: DiscoursePatch): void {
  safeSet(DISCOURSE_PATCH_PREFIX + discourseDocId, JSON.stringify(patch));
}

export function loadDiscoursePatch(discourseDocId: string): DiscoursePatch | null {
  const raw = safeGet(DISCOURSE_PATCH_PREFIX + discourseDocId);
  if (!raw) return null;
  try {
    const parsed = DiscoursePatchSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function deleteDiscoursePatch(discourseDocId: string): void {
  safeRemove(DISCOURSE_PATCH_PREFIX + discourseDocId);
}

/**
 * Reconstruct the live (edited) discourse document for a generated base —
 * but ONLY when the stored patch was authored against THIS base: the source
 * edition must match and the base fingerprint must not have drifted. On any
 * mismatch the patch is SKIPPED (never deleted) and a warning logged, exactly
 * like the syntax-side `applyStoredPatch`.
 */
export function applyStoredDiscoursePatch(base: DiscourseDocument): DiscourseDocument {
  const patch = loadDiscoursePatch(base.id);
  if (!patch) return base;
  if (patch.base.sourceId !== base.sourceId) {
    console.warn(
      `Stored discourse edits for ${base.id} belong to ${patch.base.sourceId}, not ${base.sourceId}; showing the base unedited.`,
    );
    return base;
  }
  if (patch.base.baseHash && patch.base.baseHash !== hashDiscourseBase(base)) {
    console.warn(
      `Stored discourse edits for ${base.id} were made against a different base version; showing the base unedited.`,
    );
    return base;
  }
  return applyDiscoursePatch(base, patch);
}

// --- last-loaded range (session restore) ----------------------------------------

export interface LastDiscourseRange {
  sourceId: string;
  bookNum: number;
  startRef: string;
  endRef: string;
  granularity: string;
}

export function saveLastDiscourseRange(range: LastDiscourseRange): void {
  safeSet(LAST_RANGE_KEY, JSON.stringify(range));
}

export function loadLastDiscourseRange(): LastDiscourseRange | null {
  const raw = safeGet(LAST_RANGE_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LastDiscourseRange>;
    if (
      typeof v.sourceId === 'string' &&
      typeof v.bookNum === 'number' &&
      typeof v.startRef === 'string' &&
      typeof v.endRef === 'string'
    ) {
      return {
        sourceId: v.sourceId,
        bookNum: v.bookNum,
        startRef: v.startRef,
        endRef: v.endRef,
        granularity: typeof v.granularity === 'string' ? v.granularity : 'sentence',
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Remove all discourse patches + the range pointer (backup reset path). */
export function clearAllDiscourseData(): void {
  if (typeof localStorage === 'undefined') return;
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(DISCOURSE_PATCH_PREFIX)) keys.push(k);
    }
  } catch {
    /* ignore */
  }
  for (const k of keys) safeRemove(k);
  safeRemove(LAST_RANGE_KEY);
}
