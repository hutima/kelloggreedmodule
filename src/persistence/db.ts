import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { KrDocumentSchema, type KrDocument } from '@/domain/schema';

/**
 * PERSISTENCE LAYER — IndexedDB via `idb`, with a graceful localStorage
 * fallback so the app still saves in environments without IndexedDB (private
 * windows, some embedded webviews). Documents are validated with Zod on the way
 * out of storage so a corrupted record can never crash the app.
 */

const DB_NAME = 'kellogg-reed';
const DB_VERSION = 1;
const STORE = 'documents';

interface KrDB extends DBSchema {
  documents: {
    key: string;
    value: KrDocument;
    indexes: { 'by-updated': string };
  };
}

let dbPromise: Promise<IDBPDatabase<KrDB>> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function getDb(): Promise<IDBPDatabase<KrDB>> {
  if (!dbPromise) {
    dbPromise = openDB<KrDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('by-updated', 'updatedAt');
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
