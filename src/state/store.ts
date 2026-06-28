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
import { scheduleAutosave } from './autosave';
import type { AppMode, EditorState, Selection } from './types';

const HISTORY_LIMIT = 100;

export interface EditorActions {
  // lifecycle
  newDocument: (language: Language, title?: string) => void;
  loadDocument: (doc: KrDocument) => void;
  setMode: (mode: AppMode) => void;
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
  // inference
  refreshInferences: () => void;
  acceptInference: (id: string) => void;
  rejectInference: (id: string) => void;
  acceptAllInferences: () => void;
  rejectAllInferences: () => void;
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
  };

  return {
    doc: initialDoc(),
    mode: 'manual',
    selection: {},
    inferences: [],
    status: 'idle',
    past: [],
    future: [],

    newDocument: (language, title) => {
      const doc = createDocument({ language, title });
      set({ doc, past: [], future: [], inferences: [], selection: {}, status: 'idle' });
      scheduleAutosave(doc, (status) => set({ status }));
    },

    loadDocument: (doc) =>
      set({ doc, past: [], future: [], inferences: [], selection: {}, status: 'saved' }),

    setMode: (mode) => {
      set({ mode });
      if (mode === 'assisted') get().refreshInferences();
    },

    setTitle: (title) => commit((d) => ({ ...d, title })),
    setNotes: (notes) => commit((d) => ({ ...d, notes })),
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
