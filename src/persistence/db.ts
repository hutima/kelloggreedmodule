import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';

/**
 * PERSISTENCE LAYER — IndexedDB via `idb`, with a graceful localStorage
 * fallback so the app still saves in environments without IndexedDB (private
 * windows, some embedded webviews). Documents are validated with Zod on the way
 * out of storage so a corrupted record can never crash the app.
 */

const DB_NAME = 'kellogg-reed';
const DB_VERSION = 3;
const STORE = 'documents';
/**
 * Explicitly SAVED custom parses (typed/imported sentences the user chose to
 * keep), kept apart from the `documents` session cache — which autosaves every
 * doc that is merely viewed. This store is the curated "my sentences" list shown
 * in the New source tab.
 */
const CUSTOM_STORE = 'customParses';
/**
 * Pristine base (gold-standard) assignments, keyed by passage id, so user edits
 * can be diffed against them and reset back to source after a reload. Kept in a
 * SEPARATE store from `documents` (the live-doc session cache) so neither one's
 * tuned behaviour leaks into the other.
 */
const BASE_STORE = 'bases';

interface KrDB extends DBSchema {
  documents: {
    key: string;
    value: KrDocument;
    indexes: { 'by-updated': string };
  };
  bases: {
    key: string;
    value: KrDocument;
  };
  customParses: {
    key: string;
    value: KrDocument;
  };
}

let dbPromise: Promise<IDBPDatabase<KrDB>> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function getDb(): Promise<IDBPDatabase<KrDB>> {
  if (!dbPromise) {
    dbPromise = openDB<KrDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('by-updated', 'updatedAt');
        }
        if (oldVersion < 2) {
          db.createObjectStore(BASE_STORE, { keyPath: 'id' });
        }
        if (oldVersion < 3) {
          db.createObjectStore(CUSTOM_STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// --- localStorage fallback ----------------------------------------------------

const LS_PREFIX = 'kr-doc:';

function lsSave(doc: KrDocument): void {
  localStorage.setItem(LS_PREFIX + doc.id, JSON.stringify(doc));
}
function lsAll(): KrDocument[] {
  const out: KrDocument[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(LS_PREFIX)) continue;
    const parsed = KrDocumentSchema.safeParse(JSON.parse(localStorage.getItem(key)!));
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// --- public API ---------------------------------------------------------------

export async function saveDocument(doc: KrDocument): Promise<void> {
  const valid = KrDocumentSchema.parse(doc);
  if (hasIndexedDb()) {
    const db = await getDb();
    await db.put(STORE, valid);
  } else {
    lsSave(valid);
  }
}

export async function getDocument(id: string): Promise<KrDocument | undefined> {
  if (hasIndexedDb()) {
    const db = await getDb();
    const raw = await db.get(STORE, id);
    if (!raw) return undefined;
    const parsed = KrDocumentSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  }
  const raw = localStorage.getItem(LS_PREFIX + id);
  if (!raw) return undefined;
  const parsed = KrDocumentSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : undefined;
}

export interface DocumentSummary {
  id: string;
  title: string;
  language: KrDocument['language'];
  updatedAt: string;
  preview: string;
}

/** Recent documents, most-recently-updated first. */
export async function listDocuments(limit = 25): Promise<DocumentSummary[]> {
  const docs = hasIndexedDb() ? await (await getDb()).getAll(STORE) : lsAll();
  return docs
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, limit)
    .map((d) => ({
      id: d.id,
      title: d.title,
      language: d.language,
      updatedAt: d.updatedAt,
      preview: d.text.slice(0, 80),
    }));
}

export async function deleteDocument(id: string): Promise<void> {
  if (hasIndexedDb()) {
    const db = await getDb();
    await db.delete(STORE, id);
  } else {
    localStorage.removeItem(LS_PREFIX + id);
  }
}

// --- base assignments ---------------------------------------------------------

const LS_BASE_PREFIX = 'kr-base:';

/** Persist a pristine base assignment so edits can be reset to source later. */
export async function saveBase(doc: KrDocument): Promise<void> {
  const valid = KrDocumentSchema.parse(doc);
  if (hasIndexedDb()) {
    const db = await getDb();
    await db.put(BASE_STORE, valid);
  } else {
    try {
      localStorage.setItem(LS_BASE_PREFIX + valid.id, JSON.stringify(valid));
    } catch {
      /* storage full — reset-to-source simply won't be available offline */
    }
  }
}

export async function getBase(id: string): Promise<KrDocument | undefined> {
  if (hasIndexedDb()) {
    const db = await getDb();
    const raw = await db.get(BASE_STORE, id);
    if (!raw) return undefined;
    const parsed = KrDocumentSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  }
  const raw = localStorage.getItem(LS_BASE_PREFIX + id);
  if (!raw) return undefined;
  const parsed = KrDocumentSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : undefined;
}

// --- saved custom parses ------------------------------------------------------

const LS_CUSTOM_PREFIX = 'kr-custom:';

/** Save (or update) an explicitly-kept custom parse. */
export async function saveCustomParse(doc: KrDocument): Promise<void> {
  const valid = KrDocumentSchema.parse(doc);
  if (hasIndexedDb()) {
    await (await getDb()).put(CUSTOM_STORE, valid);
  } else {
    try {
      localStorage.setItem(LS_CUSTOM_PREFIX + valid.id, JSON.stringify(valid));
    } catch {
      /* storage full — the custom parse simply won't persist */
    }
  }
}

/** The saved custom parses, most-recently-updated first. */
export async function listCustomParses(): Promise<DocumentSummary[]> {
  let docs: KrDocument[];
  if (hasIndexedDb()) {
    docs = await (await getDb()).getAll(CUSTOM_STORE);
  } else {
    docs = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LS_CUSTOM_PREFIX)) continue;
      const parsed = KrDocumentSchema.safeParse(JSON.parse(localStorage.getItem(key)!));
      if (parsed.success) docs.push(parsed.data);
    }
  }
  return docs
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map((d) => ({
      id: d.id,
      title: d.title,
      language: d.language,
      updatedAt: d.updatedAt,
      preview: d.text.slice(0, 80),
    }));
}

export async function getCustomParse(id: string): Promise<KrDocument | undefined> {
  if (hasIndexedDb()) {
    const raw = await (await getDb()).get(CUSTOM_STORE, id);
    const parsed = raw ? KrDocumentSchema.safeParse(raw) : undefined;
    return parsed?.success ? parsed.data : undefined;
  }
  const raw = localStorage.getItem(LS_CUSTOM_PREFIX + id);
  if (!raw) return undefined;
  const parsed = KrDocumentSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : undefined;
}

export async function deleteCustomParse(id: string): Promise<void> {
  if (hasIndexedDb()) {
    await (await getDb()).delete(CUSTOM_STORE, id);
  } else {
    localStorage.removeItem(LS_CUSTOM_PREFIX + id);
  }
}
