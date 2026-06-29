import { z } from 'zod';
import {
  KrDocumentSchema,
  CustomAssignmentPatchSchema,
  SermonPrepDataSchema,
  type KrDocument,
  type CustomAssignmentPatch,
  type SermonPrepData,
} from '@/domain/schema';
import { diffDocuments, hashBase } from '@/domain/patch';
import { collectAllUserData, type AllUserData } from '@/persistence';
import type { Corpus } from '@/state/types';

/**
 * Import / export packaging for user data. We deliberately export EITHER a
 * compact assignment diff (preferred — never duplicates the base) or, on request,
 * a full KR document. Imports are detected and Zod-validated before anything is
 * applied, and a diff carries a base hash so a source mismatch can be warned
 * about. Nothing here mutates state; the caller applies a validated result.
 */

const AllUserDataSchema = z.object({
  schemaVersion: z.literal(1),
  patches: z.array(CustomAssignmentPatchSchema).default([]),
  sermonPrep: z.array(SermonPrepDataSchema).default([]),
  exportedAt: z.string(),
});

/** A self-contained package for one passage (diff + sermon + a copy of text). */
export interface PassagePackage {
  schemaVersion: 1;
  kind: 'passagePackage';
  reference: string;
  corpus: Corpus;
  patch?: CustomAssignmentPatch;
  sermonPrep?: SermonPrepData;
  /** A full document copy, included only when requested (larger). */
  document?: KrDocument;
  exportedAt: string;
}

export function buildPatch(
  base: KrDocument,
  edited: KrDocument,
  corpus: Corpus,
  now: string,
): CustomAssignmentPatch {
  return diffDocuments(
    base,
    edited,
    { corpus, passageId: base.id, baseHash: hashBase(base) },
    now,
  );
}

export function buildPassagePackage(
  opts: {
    doc: KrDocument;
    base: KrDocument | null;
    corpus: Corpus;
    sermon?: SermonPrepData;
    includeFullDocument?: boolean;
  },
  now: string,
): PassagePackage {
  const { doc, base, corpus, sermon, includeFullDocument } = opts;
  return {
    schemaVersion: 1,
    kind: 'passagePackage',
    reference: doc.title,
    corpus,
    patch: base ? buildPatch(base, doc, corpus, now) : undefined,
    sermonPrep: sermon,
    document: includeFullDocument || !base ? KrDocumentSchema.parse(doc) : undefined,
    exportedAt: now,
  };
}

export function exportAllUserData(now: string): AllUserData {
  return collectAllUserData(now);
}

// --- import detection / validation -------------------------------------------

export type ImportKind = 'patch' | 'document' | 'sermon' | 'package' | 'backup';

export interface ImportDetect {
  ok: boolean;
  kind?: ImportKind;
  patch?: CustomAssignmentPatch;
  document?: KrDocument;
  sermon?: SermonPrepData;
  pkg?: PassagePackage;
  backup?: AllUserData;
  error?: string;
}

const PassagePackageSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('passagePackage'),
  reference: z.string().default(''),
  corpus: z.enum(['gnt', 'ot', 'custom']).default('custom'),
  patch: CustomAssignmentPatchSchema.optional(),
  sermonPrep: SermonPrepDataSchema.optional(),
  document: KrDocumentSchema.optional(),
  exportedAt: z.string(),
});

/** Sniff the file shape and validate it with the matching schema. */
export function detectImport(text: string): ImportDetect {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  const obj = raw as Record<string, unknown>;

  if (obj && obj.kind === 'passagePackage') {
    const p = PassagePackageSchema.safeParse(raw);
    return p.success
      ? { ok: true, kind: 'package', pkg: p.data as PassagePackage }
      : { ok: false, error: issues(p.error) };
  }
  if (obj && Array.isArray(obj.patches) && Array.isArray(obj.sermonPrep)) {
    const b = AllUserDataSchema.safeParse(raw);
    return b.success
      ? { ok: true, kind: 'backup', backup: b.data as AllUserData }
      : { ok: false, error: issues(b.error) };
  }
  if (obj && obj.base && obj.syntaxPatch) {
    const p = CustomAssignmentPatchSchema.safeParse(raw);
    return p.success ? { ok: true, kind: 'patch', patch: p.data } : { ok: false, error: issues(p.error) };
  }
  if (obj && obj.passageId && (obj.notes || obj.highlights)) {
    const s = SermonPrepDataSchema.safeParse(raw);
    return s.success ? { ok: true, kind: 'sermon', sermon: s.data } : { ok: false, error: issues(s.error) };
  }
  // Fall back to a full document.
  const d = KrDocumentSchema.safeParse(raw);
  return d.success
    ? { ok: true, kind: 'document', document: d.data }
    : { ok: false, error: 'Unrecognized file. Expected an assignment diff, document, sermon prep, or backup.' };
}

function issues(err: { issues: { path: (string | number)[]; message: string }[] }): string {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}
