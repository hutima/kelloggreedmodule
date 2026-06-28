import {
  KrDocumentSchema,
  SCHEMA_VERSION,
  type KrDocument,
} from '@/domain/schema';

/**
 * JSON import/export with schema validation and forward-compatible migration.
 * Exported files are plain, human-readable JSON so analyses are portable and
 * diffable.
 */

export function exportJson(doc: KrDocument): string {
  return JSON.stringify(KrDocumentSchema.parse(doc), null, 2);
}

/** Migrates a raw parsed object up to the current schema version. */
function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  // No breaking versions yet; stamp the current version if missing.
  if (typeof obj.schemaVersion !== 'number') {
    return { ...obj, schemaVersion: SCHEMA_VERSION };
  }
  return obj;
}

export interface ImportResult {
  ok: boolean;
  document?: KrDocument;
  error?: string;
}

export function importJson(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  const parsed = KrDocumentSchema.safeParse(migrate(raw));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; '),
    };
  }
  return { ok: true, document: parsed.data };
}
