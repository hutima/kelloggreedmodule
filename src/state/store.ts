import { create } from 'zustand';
import type {
  KrDocument,
  Language,
  Relation,
  SyntaxNode,
  Token,
  NodeLayoutHint,
} from '@/domain/schema';
import {
  createDocument,
  reindex,
  removeNodeSubtree,
  removeRelation,
  tokenize,
  touch,
  updateNode as mUpdateNode,
  updateRelation as mUpdateRelation,
  updateToken as mUpdateToken,
  upsertNode,
  upsertRelation,
} from '@/domain/model';
import {
  applyInference,
  applyInferences,
  runInference,
  type Inference,
} from '@/domain/inference';
import { getDocument, saveDocument } from '@/persistence';
import { scheduleAutosave } from './autosave';
import type { AppMode, EditorState, Selection } from './types';

const HISTORY_LIMIT = 100;

/**
 * The id of the last document the user was viewing/editing, so a refresh (or an
 * iOS Safari pinch-zoom that blanks the page) restores it instead of dropping to
 * a blank doc. The document itself lives in IndexedDB (autosaved); this is just
 * the pointer to it.
 */
const LAST_DOC_KEY = 'kr:lastDoc';

function rememberLastDoc(id: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LAST_DOC_KEY, id);
  } catch {
    /* storage full or disabled — the session simply won't be restorable */
  }
}

/** Persist an opened/navigated passage so it survives a reload (best-effort). */
function persistOpened(doc: KrDocument): void {
  rememberLastDoc(doc.id);
  // Opened passages are generated from source XML and aren't in storage yet, so
  // save the document too; otherwise there is nothing to restore by id.
  void saveDocument(doc).catch(() => {});
}

/**
 * Analyst notes persist PER PASSAGE, keyed by the document id (which is
 * deterministic for a given GNT passage selection), so reopening the same
 * passage restores its notes. Stored in localStorage; absent/erroring storage
 * (tests, private mode) degrades to no persistence.
 */
const notesKey = (docId: string) => `kr:notes:${docId}`;

function loadPassageNotes(docId: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(notesKey(docId));
  } catch {
    return null;
  }
}

function savePassageNotes(docId: string, notes: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (notes) localStorage.setItem(notesKey(docId), notes);
    else localStorage.removeItem(notesKey(docId));
  } catch {
    /* storage full or disabled — notes simply won't persist */
  }
}

export interface EditorActions {
  // lifecycle
  newDocument: (language: Language, title?: string) => void;
  loadDocument: (doc: KrDocument) => void;
  /** Restore the last viewed passage (after a reload), if any. */
  restoreLastSession: () => Promise<void>;
  setMode: (mode: AppMode) => void;
  /** Set the GNT reading context (book's sentences + current index) for nav. */
  setGntContext: (passages: KrDocument[], index: number) => void;
  /** Collapse/expand the left (sources) panel. */
  setLeftCollapsed: (collapsed: boolean) => void;
  /** Load the sentence `delta` away in the current GNT book (prev/next). */
  stepGnt: (delta: number) => void;
  // document fields
  setTitle: (title: string) => void;
  setNotes: (notes: string) => void;
  setText: (text: string) => void;
  setLanguage: (language: Language) => void;
  // tokens
  tokenizeText: () => void;
  setTokens: (tokens: Token[]) => void;
  updateToken: (id: string, patch: Partial<Token>) => void;
  // syntax
  upsertNode: (node: SyntaxNode) => void;
  updateNode: (id: string, patch: Partial<SyntaxNode>) => void;
  removeNode: (id: string) => void;
  upsertRelation: (relation: Relation) => void;
  updateRelation: (id: string, patch: Partial<Relation>) => void;
  removeRelation: (id: string) => void;
  // layout
  setLayoutHint: (nodeId: string, hint: NodeLayoutHint | undefined) => void;
  // selection
  select: (selection: Selection) => void;
  // view
  setVerticalScale: (scale: number) => void;
  // click-to-relink
  startRelink: (relationId: string, end: 'head' | 'dependent') => void;
  cancelRelink: () => void;
  relinkTo: (nodeId: string) => void;
  // inference
  refreshInferences: () => void;
  acceptInference: (id: string) => void;
  rejectInference: (id: string) => void;
  acceptAllInferences: () => void;
  rejectAllInferences: () => void;
  /** Run inference and APPLY it, seeding a rough editable parse (GNT Guided). */
  bootstrapParse: () => void;
  // history
  undo: () => void;
  redo: () => void;
  // persistence
  markSaved: () => void;
}

export type EditorStore = EditorState & EditorActions;

function initialDoc(): KrDocument {
  return createDocument({ language: 'en', title: 'Untitled' });
}

export const useEditorStore = create<EditorStore>((set, get) => {
  /** Apply a pure document transform, recording history + scheduling autosave. */
  const commit = (producer: (doc: KrDocument) => KrDocument) => {
    const { doc, past } = get();
    const next = touch(producer(doc));
    const nextPast = [...past, doc].slice(-HISTORY_LIMIT);
    set({ doc: next, past: nextPast, future: [], status: 'saving' });
    scheduleAutosave(next, (status) => set({ status }));
    rememberLastDoc(next.id); // autosave persists the doc; remember it for restore
  };

  return {
    doc: initialDoc(),
    mode: 'manual',
    selection: {},
    linking: null,
    verticalScale: 1,
    inferences: [],
    status: 'idle',
    past: [],
    future: [],
    gntPassages: [],
    gntIndex: -1,
    leftCollapsed: false,

    setGntContext: (passages, index) => set({ gntPassages: passages, gntIndex: index }),
    setLeftCollapsed: (collapsed) => set({ leftCollapsed: collapsed }),

    stepGnt: (delta) => {
      const { gntPassages, gntIndex } = get();
      const next = gntIndex + delta;
      if (next < 0 || next >= gntPassages.length) return;
      const doc = gntPassages[next]!;
      const saved = loadPassageNotes(doc.id);
      const withNotes = saved != null ? { ...doc, notes: saved } : doc;
      set({
        doc: withNotes,
        gntIndex: next,
        past: [],
        future: [],
        inferences: [],
        selection: {},
        linking: null,
        status: 'saved',
      });
      persistOpened(withNotes);
    },

    newDocument: (language, title) => {
      const doc = createDocument({ language, title });
      set({ doc, past: [], future: [], inferences: [], selection: {}, linking: null, status: 'idle' });
      scheduleAutosave(doc, (status) => set({ status }));
    },

    loadDocument: (doc) => {
      // Restore any notes saved for this passage (keyed by document id).
      const saved = loadPassageNotes(doc.id);
      const next = saved != null ? { ...doc, notes: saved } : doc;
      set({ doc: next, past: [], future: [], inferences: [], selection: {}, linking: null, status: 'saved' });
      persistOpened(next);
    },

    restoreLastSession: async () => {
      if (typeof localStorage === 'undefined') return;
      let id: string | null = null;
      try {
        id = localStorage.getItem(LAST_DOC_KEY);
      } catch {
        return;
      }
      if (!id || id === get().doc.id) return;
      const doc = await getDocument(id);
      if (!doc) return;
      const saved = loadPassageNotes(doc.id);
      const next = saved != null ? { ...doc, notes: saved } : doc;
      set({
        doc: next,
        // A restored gold-standard passage reads like a reopened one.
        mode: next.syntax.nodes.length ? 'parsed' : get().mode,
        past: [],
        future: [],
        inferences: [],
        selection: {},
        linking: null,
        status: 'saved',
      });
    },

    setMode: (mode) => {
      set({ mode });
      if (mode === 'assisted') get().refreshInferences();
    },

    setTitle: (title) => commit((d) => ({ ...d, title })),
    setNotes: (notes) => {
      savePassageNotes(get().doc.id, notes);
      commit((d) => ({ ...d, notes }));
    },
    setText: (text) => commit((d) => ({ ...d, text })),
    setLanguage: (language) => commit((d) => ({ ...d, language })),

    tokenizeText: () =>
      commit((d) => ({ ...d, tokens: tokenize(d.text, d.language) })),

    setTokens: (tokens) => commit((d) => ({ ...d, tokens: reindex(tokens) })),

    updateToken: (id, patch) => commit((d) => mUpdateToken(d, id, patch)),

    upsertNode: (node) => commit((d) => ({ ...d, syntax: upsertNode(d.syntax, node) })),
    updateNode: (id, patch) =>
      commit((d) => ({ ...d, syntax: mUpdateNode(d.syntax, id, patch) })),
    removeNode: (id) =>
      commit((d) => ({ ...d, syntax: removeNodeSubtree(d.syntax, id) })),

    upsertRelation: (relation) =>
      commit((d) => ({ ...d, syntax: upsertRelation(d.syntax, relation) })),
    updateRelation: (id, patch) =>
      commit((d) => ({ ...d, syntax: mUpdateRelation(d.syntax, id, patch) })),
    removeRelation: (id) =>
      commit((d) => ({ ...d, syntax: removeRelation(d.syntax, id) })),

    setLayoutHint: (nodeId, hint) =>
      commit((d) => {
        const layoutHints = { ...d.layoutHints };
        if (hint) layoutHints[nodeId] = hint;
        else delete layoutHints[nodeId];
        return { ...d, layoutHints };
      }),

    select: (selection) => set({ selection }),

    setVerticalScale: (scale) => set({ verticalScale: Math.min(2.5, Math.max(0.6, scale)) }),

    startRelink: (relationId, end) => set({ linking: { relationId, end }, selection: { relationId } }),
    cancelRelink: () => set({ linking: null }),
    relinkTo: (nodeId) => {
      const { linking, doc } = get();
      if (!linking) return;
      const rel = doc.syntax.relations.find((r) => r.id === linking.relationId);
      set({ linking: null });
      if (!rel) return;
      // Re-pointing an endpoint to the other endpoint would make a self-loop.
      const other = linking.end === 'head' ? rel.dependentId : rel.headId;
      if (nodeId === other) return;
      commit((d) => ({
        ...d,
        syntax: mUpdateRelation(d.syntax, linking.relationId, {
          [linking.end === 'head' ? 'headId' : 'dependentId']: nodeId,
          provenance: { source: 'manual', confidence: 'high' },
        }),
      }));
    },

    refreshInferences: () => {
      const { doc } = get();
      set({ inferences: runInference(doc).inferences });
    },

    acceptInference: (id) => {
      const inf = get().inferences.find((i) => i.id === id);
      if (!inf) return;
      commit((d) => applyInference(d, inf));
      set({ inferences: get().inferences.filter((i) => i.id !== id) });
    },

    rejectInference: (id) =>
      set({ inferences: get().inferences.filter((i) => i.id !== id) }),

    acceptAllInferences: () => {
      const infs = get().inferences;
      if (!infs.length) return;
      commit((d) => applyInferences(d, infs));
      set({ inferences: [] });
    },

    rejectAllInferences: () => set({ inferences: [] }),

    bootstrapParse: () => {
      // Seed a rough, fully-editable parse: run the inference engine and apply
      // its suggestions straight away, so the diagram is populated for the user
      // to correct/relink rather than leaving an empty baseline behind a queue
      // of pending cards. Iterate a few times (ops are idempotent upserts) so
      // rules that build on earlier ones also land; stop once nothing new fires.
      commit((d0) => {
        let d = d0;
        for (let pass = 0; pass < 4; pass++) {
          const { inferences } = runInference(d);
          if (!inferences.length) break;
          const size = d.syntax.nodes.length + d.syntax.relations.length;
          d = applyInferences(d, inferences);
          // Idempotent upserts mean a fully-parsed doc stops growing — converged.
          if (d.syntax.nodes.length + d.syntax.relations.length === size) break;
        }
        return d;
      });
      set({ inferences: [] });
    },

    undo: () => {
      const { past, doc, future } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], status: 'saving' });
      scheduleAutosave(prev, (status) => set({ status }));
    },

    redo: () => {
      const { future, doc, past } = get();
      const next = future[0];
      if (!next) return;
      set({ doc: next, future: future.slice(1), past: [...past, doc], status: 'saving' });
      scheduleAutosave(next, (status) => set({ status }));
    },

    markSaved: () => set({ status: 'saved' }),
  };
});

/** Convenience selectors. */
export const selectCanUndo = (s: EditorStore) => s.past.length > 0;
export const selectCanRedo = (s: EditorStore) => s.future.length > 0;
export type { Inference };
