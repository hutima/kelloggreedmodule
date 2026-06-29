import { create } from 'zustand';
import type {
  KrDocument,
  Language,
  Relation,
  SyntaxNode,
  Token,
  NodeLayoutHint,
  SyntacticRole,
  ClauseType,
  SermonPrepData,
  SermonNoteCategory,
  HighlightCategory,
  SermonAnchor,
  Provenance,
} from '@/domain/schema';
import { emptySermonPrep } from '@/domain/schema';
import {
  createDocument,
  makeId,
  reindex,
  removeNodeSubtree,
  removeRelation,
  getRelation,
  systemClock,
  tokenize,
  touch,
  updateNode as mUpdateNode,
  updateRelation as mUpdateRelation,
  updateToken as mUpdateToken,
  upsertNode,
  upsertRelation,
} from '@/domain/model';
import * as sermonOps from '@/domain/sermon';
import {
  applyInference,
  applyInferences,
  runInference,
  type Inference,
} from '@/domain/inference';
import {
  getDocument,
  saveDocument,
  saveBase,
  getBase,
  savePatch,
  loadPatch,
  deletePatch,
  saveSermonPrep,
  loadSermonPrep,
  deleteSermonPrep,
} from '@/persistence';
import { applyPatch, diffDocuments, hashBase } from '@/domain/patch';
import { isEmptySyntaxPatch } from '@/domain/schema';
import { cloneSample } from '@/fixtures';
import { DEFAULT_MODE, type DiagramMode } from '@/domain/layout';
import { loadForceDesktop, saveForceDesktop } from '@/ui/responsive/viewport';
import { scheduleAutosave } from './autosave';
import type { AppMode, Corpus, EditorState, Selection, WorkMode } from './types';

const HISTORY_LIMIT = 100;

/** Provenance stamp for any user-made manual edit. */
const MANUAL: Provenance = { source: 'manual', confidence: 'high' };

/**
 * The id of the last document the user was viewing/editing, so a refresh (or an
 * iOS Safari pinch-zoom that blanks the page) restores it instead of dropping to
 * a blank doc. The document itself lives in IndexedDB (autosaved); this is just
 * the pointer to it.
 */
const LAST_DOC_KEY = 'kr:lastDoc';

/** The sample shown on a device's first-ever launch (no session to restore). */
const FIRST_RUN_SAMPLE_ID = 'doc_sample_john_1_1a';

/** True when there is no prior session pointer — i.e. this is a cold first run. */
function isFirstRun(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return !localStorage.getItem(LAST_DOC_KEY);
  } catch {
    return false;
  }
}

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
  loadDocument: (doc: KrDocument, opts?: { corpus?: Corpus }) => void;
  /** Restore the last viewed passage (after a reload), if any. */
  restoreLastSession: () => Promise<void>;
  /** Re-derive the live doc + sermon for the current passage from storage
   *  (after an import / backup restore writes new patch/sermon records). */
  reloadCurrent: () => void;
  setMode: (mode: WorkMode) => void;
  /** Switch the user-facing app mode (Explore / Edit / Sermon Prep). */
  setAppMode: (mode: AppMode) => void;
  /** Force (or unforce) the desktop layout on a small screen; persisted. */
  setForceDesktop: (value: boolean) => void;
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
  /** Add a new word (token + word node, attached to the root) for a variant
   *  reading; selects it so it can be re-roled/relinked. */
  addWord: (surface: string) => void;
  /** Delete a word node, its token(s), and any relations touching it. */
  removeWord: (nodeId: string) => void;
  // syntax
  upsertNode: (node: SyntaxNode) => void;
  updateNode: (id: string, patch: Partial<SyntaxNode>) => void;
  removeNode: (id: string) => void;
  upsertRelation: (relation: Relation) => void;
  updateRelation: (id: string, patch: Partial<Relation>) => void;
  removeRelation: (id: string) => void;
  // --- semantic editing (used by the visualization edit adapters) ---
  /** Set a node's grammatical role and align its incoming relation type. */
  setNodeRole: (nodeId: string, role: SyntacticRole) => void;
  /** Attach `dependentId` under `headId` as `type` (re-pointing its head). */
  attachNodeTo: (dependentId: string, headId: string, type: SyntacticRole) => void;
  /** Change an existing relation's type. */
  changeRelationType: (relationId: string, type: SyntacticRole) => void;
  /** Swap a relation's head and dependent. */
  reverseRelation: (relationId: string) => void;
  /** Set a clause node's clause type. */
  setClauseType: (nodeId: string, clauseType: ClauseType) => void;
  /** Mark a node implied/elided (or not). */
  setImplied: (nodeId: string, implied: boolean) => void;
  // layout
  setLayoutHint: (nodeId: string, hint: NodeLayoutHint | undefined) => void;
  // selection
  select: (selection: Selection) => void;
  // view
  setVerticalScale: (scale: number) => void;
  setDiagramMode: (mode: DiagramMode) => void;
  // click-to-relink
  startRelink: (relationId: string, end: 'head' | 'dependent') => void;
  cancelRelink: () => void;
  relinkTo: (nodeId: string) => void;
  // --- sermon prep ---
  addSermonNote: (input: {
    anchor: SermonAnchor;
    category: SermonNoteCategory;
    title?: string;
    body?: string;
  }) => void;
  updateSermonNote: (id: string, patch: { title?: string; body?: string; category?: SermonNoteCategory }) => void;
  removeSermonNote: (id: string) => void;
  toggleHighlight: (input: { anchor: SermonAnchor; category: HighlightCategory }) => void;
  removeHighlight: (id: string) => void;
  addObservation: (body: string, anchor?: SermonAnchor) => void;
  updateObservation: (id: string, body: string) => void;
  removeObservation: (id: string) => void;
  setBigIdea: (text: string) => void;
  addOutlineSection: () => void;
  updateOutlineSection: (id: string, patch: { title?: string; body?: string }) => void;
  removeOutlineSection: (id: string) => void;
  setSermonPrep: (data: SermonPrepData) => void;
  // --- reset ---
  resetPassage: (opts: {
    syntax?: boolean;
    layout?: boolean;
    sermon?: boolean;
    notes?: boolean;
  }) => void;
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

function corpusFor(doc: KrDocument): Corpus {
  if (doc.language === 'grc') return 'gnt';
  if (doc.language === 'hbo') return 'ot';
  return 'custom';
}

export const useEditorStore = create<EditorStore>((set, get) => {
  /**
   * Derive and persist the compact user-edit patch (base vs live) for the
   * current passage. A passage with a base stores edits as a DIFF; the whole
   * live doc is still autosaved separately as the session-restore cache.
   */
  const persistEdits = (live: KrDocument) => {
    const { baseDoc, corpus } = get();
    if (!baseDoc || baseDoc.id !== live.id) return;
    const now = systemClock();
    const patch = diffDocuments(
      baseDoc,
      live,
      { corpus, passageId: baseDoc.id, baseHash: hashBase(baseDoc) },
      now,
    );
    if (isEmptySyntaxPatch(patch)) deletePatch(baseDoc.id);
    else savePatch(baseDoc.id, patch);
  };

  /** Apply a pure document transform, recording history + scheduling autosave. */
  const commit = (producer: (doc: KrDocument) => KrDocument) => {
    const { doc, past } = get();
    const next = touch(producer(doc));
    const nextPast = [...past, doc].slice(-HISTORY_LIMIT);
    set({ doc: next, past: nextPast, future: [], status: 'saving' });
    scheduleAutosave(next, (status) => set({ status }));
    rememberLastDoc(next.id); // autosave persists the doc; remember it for restore
    persistEdits(next);
  };

  /** Apply a pure sermon-prep transform and persist it. */
  const commitSermon = (producer: (s: SermonPrepData) => SermonPrepData) => {
    const next = producer(get().sermon);
    set({ sermon: next });
    saveSermonPrep(next.passageId, next);
  };

  const init = initialDoc();

  return {
    doc: init,
    baseDoc: null,
    corpus: 'custom',
    sermon: emptySermonPrep(init.id, init.createdAt),
    mode: 'manual',
    appMode: 'explore',
    selection: {},
    linking: null,
    verticalScale: 1,
    diagramMode: DEFAULT_MODE,
    inferences: [],
    status: 'idle',
    past: [],
    future: [],
    gntPassages: [],
    gntIndex: -1,
    leftCollapsed: false,
    firstRun: isFirstRun(),
    forceDesktop: loadForceDesktop(),

    setGntContext: (passages, index) => set({ gntPassages: passages, gntIndex: index }),
    setLeftCollapsed: (collapsed) => set({ leftCollapsed: collapsed }),
    setAppMode: (appMode) => set({ appMode }),
    setForceDesktop: (value) => {
      saveForceDesktop(value);
      set({ forceDesktop: value });
    },

    stepGnt: (delta) => {
      const { gntPassages, gntIndex } = get();
      const next = gntIndex + delta;
      if (next < 0 || next >= gntPassages.length) return;
      const base = gntPassages[next]!;
      const stored = loadPatch(base.id);
      const live0 = stored ? applyPatch(base, stored) : base;
      const saved = loadPassageNotes(base.id);
      const live = saved != null ? { ...live0, notes: saved } : live0;
      set({
        doc: live,
        baseDoc: base,
        corpus: corpusFor(base),
        sermon: loadSermonPrep(base.id) ?? emptySermonPrep(base.id, systemClock()),
        gntIndex: next,
        past: [],
        future: [],
        inferences: [],
        selection: {},
        linking: null,
        status: 'saved',
      });
      void saveBase(base).catch(() => {});
      persistOpened(live);
    },

    newDocument: (language, title) => {
      const doc = createDocument({ language, title });
      set({
        doc,
        baseDoc: null,
        corpus: 'custom',
        sermon: emptySermonPrep(doc.id, doc.createdAt),
        past: [],
        future: [],
        inferences: [],
        selection: {},
        linking: null,
        status: 'idle',
      });
      scheduleAutosave(doc, (status) => set({ status }));
    },

    loadDocument: (doc, opts) => {
      // The given doc is the pristine BASE; user edits are reconstructed on top.
      const base = doc;
      const stored = loadPatch(base.id);
      const live0 = stored ? applyPatch(base, stored) : base;
      const saved = loadPassageNotes(base.id);
      const live = saved != null ? { ...live0, notes: saved } : live0;
      set({
        doc: live,
        baseDoc: base,
        corpus: opts?.corpus ?? corpusFor(base),
        sermon: loadSermonPrep(base.id) ?? emptySermonPrep(base.id, systemClock()),
        past: [],
        future: [],
        inferences: [],
        selection: {},
        linking: null,
        status: 'saved',
      });
      void saveBase(base).catch(() => {});
      persistOpened(live);
    },

    restoreLastSession: async () => {
      if (typeof localStorage === 'undefined') return;
      let id: string | null = null;
      try {
        id = localStorage.getItem(LAST_DOC_KEY);
      } catch {
        return;
      }
      // First-ever launch: open to a sensible default (John 1:1) and reveal the
      // passage selector so it's obvious where to choose a different text.
      if (!id) {
        const sample = cloneSample(FIRST_RUN_SAMPLE_ID);
        if (sample) {
          get().loadDocument(sample, { corpus: 'gnt' });
          set({ leftCollapsed: false });
        }
        return;
      }
      if (id === get().doc.id) return;
      const live = await getDocument(id);
      if (!live) return;
      const base = (await getBase(id)) ?? null;
      const saved = loadPassageNotes(live.id);
      const next = saved != null ? { ...live, notes: saved } : live;
      set({
        doc: next,
        baseDoc: base,
        corpus: corpusFor(next),
        sermon: loadSermonPrep(live.id) ?? emptySermonPrep(live.id, systemClock()),
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

    reloadCurrent: () => {
      const { baseDoc, doc } = get();
      const id = baseDoc?.id ?? doc.id;
      const sermon = loadSermonPrep(id) ?? emptySermonPrep(id, systemClock());
      if (baseDoc) {
        const stored = loadPatch(baseDoc.id);
        const live0 = stored ? applyPatch(baseDoc, stored) : baseDoc;
        const saved = loadPassageNotes(baseDoc.id);
        const live = saved != null ? { ...live0, notes: saved } : live0;
        set({ doc: live, sermon, past: [], future: [], selection: {}, linking: null, status: 'saved' });
        persistOpened(live);
      } else {
        set({ sermon });
      }
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

    addWord: (surface) => {
      const trimmed = surface.trim();
      if (!trimmed) return;
      const tokenId = makeId('tok');
      const nodeId = makeId('node');
      commit((d) => {
        const token: Token = {
          id: tokenId,
          index: d.tokens.length,
          surface: trimmed,
          language: d.language,
          provenance: { source: 'manual', confidence: 'high' },
        };
        const node: SyntaxNode = {
          id: nodeId,
          kind: 'word',
          tokenIds: [tokenId],
          provenance: { source: 'manual', confidence: 'high' },
        };
        // Attach to the root so the new word is visible immediately; the user can
        // then change its role or relink it to the right head.
        const relation: Relation = {
          id: makeId('rel'),
          type: 'adjunct',
          headId: d.syntax.rootId,
          dependentId: nodeId,
          provenance: { source: 'manual', confidence: 'high' },
        };
        return {
          ...d,
          tokens: reindex([...d.tokens, token]),
          syntax: {
            ...d.syntax,
            nodes: [...d.syntax.nodes, node],
            relations: [...d.syntax.relations, relation],
          },
        };
      });
      set({ selection: { nodeId } });
    },

    removeWord: (nodeId) =>
      commit((d) => {
        const node = d.syntax.nodes.find((n) => n.id === nodeId);
        if (!node || nodeId === d.syntax.rootId) return d; // never orphan the root
        const tokenIds = new Set(node.tokenIds);
        return {
          ...d,
          tokens: reindex(d.tokens.filter((t) => !tokenIds.has(t.id))),
          syntax: {
            ...d.syntax,
            nodes: d.syntax.nodes.filter((n) => n.id !== nodeId),
            // Drop relations touching the word; its former children simply detach.
            relations: d.syntax.relations.filter(
              (r) => r.headId !== nodeId && r.dependentId !== nodeId,
            ),
          },
        };
      }),

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

    // --- semantic editing ---------------------------------------------------
    setNodeRole: (nodeId, role) =>
      commit((d) => {
        let syntax = mUpdateNode(d.syntax, nodeId, { role, provenance: MANUAL });
        const parent = d.syntax.relations.find((r) => r.dependentId === nodeId);
        if (parent) syntax = mUpdateRelation(syntax, parent.id, { type: role, provenance: MANUAL });
        return { ...d, syntax };
      }),

    attachNodeTo: (dependentId, headId, type) => {
      if (dependentId === headId) return;
      commit((d) => {
        const parents = d.syntax.relations.filter((r) => r.dependentId === dependentId);
        let syntax = d.syntax;
        if (parents.length) {
          const [first, ...rest] = parents;
          syntax = mUpdateRelation(syntax, first!.id, { headId, type, provenance: MANUAL });
          for (const r of rest) syntax = removeRelation(syntax, r.id);
        } else {
          syntax = upsertRelation(syntax, {
            id: makeId('rel'),
            type,
            headId,
            dependentId,
            provenance: MANUAL,
          });
        }
        return { ...d, syntax };
      });
    },

    changeRelationType: (relationId, type) =>
      commit((d) => ({
        ...d,
        syntax: mUpdateRelation(d.syntax, relationId, { type, provenance: MANUAL }),
      })),

    reverseRelation: (relationId) =>
      commit((d) => {
        const r = getRelation(d.syntax, relationId);
        if (!r) return d;
        return {
          ...d,
          syntax: mUpdateRelation(d.syntax, relationId, {
            headId: r.dependentId,
            dependentId: r.headId,
            provenance: MANUAL,
          }),
        };
      }),

    setClauseType: (nodeId, clauseType) =>
      commit((d) => ({
        ...d,
        syntax: mUpdateNode(d.syntax, nodeId, { clauseType, provenance: MANUAL }),
      })),

    setImplied: (nodeId, implied) =>
      commit((d) => ({
        ...d,
        syntax: mUpdateNode(d.syntax, nodeId, { implied, provenance: MANUAL }),
      })),

    setLayoutHint: (nodeId, hint) =>
      commit((d) => {
        const layoutHints = { ...d.layoutHints };
        if (hint) layoutHints[nodeId] = hint;
        else delete layoutHints[nodeId];
        return { ...d, layoutHints };
      }),

    select: (selection) => set({ selection }),

    setVerticalScale: (scale) => set({ verticalScale: Math.min(2.5, Math.max(0.6, scale)) }),

    setDiagramMode: (mode) => set({ diagramMode: mode }),

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

    // --- sermon prep --------------------------------------------------------
    addSermonNote: (input) => commitSermon((s) => sermonOps.addNote(s, input, systemClock()).data),
    updateSermonNote: (id, patch) =>
      commitSermon((s) => sermonOps.updateNote(s, id, patch, systemClock())),
    removeSermonNote: (id) => commitSermon((s) => sermonOps.removeNote(s, id, systemClock())),
    toggleHighlight: (input) =>
      commitSermon((s) => sermonOps.toggleHighlight(s, input, systemClock())),
    removeHighlight: (id) => commitSermon((s) => sermonOps.removeHighlight(s, id, systemClock())),
    addObservation: (body, anchor) =>
      commitSermon((s) => sermonOps.addObservation(s, { body, anchor }, systemClock()).data),
    updateObservation: (id, body) =>
      commitSermon((s) => sermonOps.updateObservation(s, id, { body }, systemClock())),
    removeObservation: (id) =>
      commitSermon((s) => sermonOps.removeObservation(s, id, systemClock())),
    setBigIdea: (text) => commitSermon((s) => sermonOps.setBigIdea(s, text, systemClock())),
    addOutlineSection: () => commitSermon((s) => sermonOps.addOutlineSection(s, systemClock())),
    updateOutlineSection: (id, patch) =>
      commitSermon((s) => sermonOps.updateOutlineSection(s, id, patch, systemClock())),
    removeOutlineSection: (id) =>
      commitSermon((s) => sermonOps.removeOutlineSection(s, id, systemClock())),
    setSermonPrep: (data) => {
      set({ sermon: data });
      saveSermonPrep(data.passageId, data);
    },

    // --- reset --------------------------------------------------------------
    resetPassage: ({ syntax, layout, sermon, notes }) => {
      const { baseDoc, doc } = get();
      if ((syntax || layout) && baseDoc) {
        commit((d) => {
          // Rebuild the live doc, restoring the chosen categories from the base
          // and keeping the rest as-is.
          const next: KrDocument = { ...d };
          if (syntax) {
            next.syntax = baseDoc.syntax;
            next.tokens = baseDoc.tokens;
          }
          if (layout) next.layoutHints = baseDoc.layoutHints;
          return next;
        });
        // A fully-reset syntax+layout means no patch at all.
        if (syntax && layout) deletePatch(baseDoc.id);
      }
      if (notes) {
        savePassageNotes(doc.id, '');
        commit((d) => ({ ...d, notes: '' }));
      }
      if (sermon) {
        const empty = emptySermonPrep(doc.id, systemClock());
        set({ sermon: empty });
        deleteSermonPrep(doc.id);
      }
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
      persistEdits(prev);
    },

    redo: () => {
      const { future, doc, past } = get();
      const next = future[0];
      if (!next) return;
      set({ doc: next, future: future.slice(1), past: [...past, doc], status: 'saving' });
      scheduleAutosave(next, (status) => set({ status }));
      persistEdits(next);
    },

    markSaved: () => set({ status: 'saved' }),
  };
});

/** Convenience selectors. */
export const selectCanUndo = (s: EditorStore) => s.past.length > 0;
export const selectCanRedo = (s: EditorStore) => s.future.length > 0;
export type { Inference };
