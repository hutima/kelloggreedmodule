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
import {
  applyAlternateReadingPreview,
  getReadingById,
  getIssueById,
  getIssuesForPassage,
  isMergeIssue,
} from '@/domain/contested';
import { combinePassage, loadGntBook, loadOtChapter, GNT_BOOKS, OT_BOOKS } from '@/io';
import type { ContestedSyntaxIssue } from '@/domain/schema';
import type {
  ActiveEditModal,
  AlternateDisplayMode,
  AppMode,
  BasicEditTool,
  Corpus,
  EditorState,
  EditTier,
  Selection,
  WorkMode,
} from './types';

const HISTORY_LIMIT = 100;

/** Provenance stamp for any user-made manual edit. */
const MANUAL: Provenance = { source: 'manual', confidence: 'high' };

/** Fresh contested-syntax UI state for a newly loaded passage. */
const FRESH_CONTESTED = {
  showAlternateParsePanel: false,
  alternateDisplayMode: 'base-only' as const,
  linkedScrolling: true,
};

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
  /**
   * Clear ALL manual layout hints (offsets / collapsed / slant), forcing the
   * diagram to re-flow purely from the parse via the layout engine. Used by the
   * Kellogg-Reed "Clean up" control to undo placement clashes left over after
   * structural edits. No-op when there are no hints. Undoable.
   */
  cleanLayout: () => void;
  /** Group the word nodes that own `tokenIds` into a single phrase/block node. */
  groupTokens: (tokenIds: string[]) => void;
  /** Split a multi-token node back into one word node per token. */
  ungroupNode: (nodeId: string) => void;
  // selection
  select: (selection: Selection) => void;
  // view
  setVerticalScale: (scale: number) => void;
  setDiagramMode: (mode: DiagramMode) => void;
  /** Toggle English-gloss display in the structural diagrams. */
  setGlossMode: (value: boolean) => void;
  // --- tier-aware editing (Basic / Advanced) ---
  /** Switch the editing surface; resets any in-progress tool/link state. */
  setEditTier: (tier: EditTier) => void;
  /** Select the active Basic-Edit tool; resets any in-progress link state. */
  setActiveEditTool: (tool: BasicEditTool) => void;
  /** Begin a visual relationship with `dependentId` as the dependent. */
  startVisualLink: (dependentId: string) => void;
  /** Set the candidate head currently hovered (drives the preview arc). */
  setLinkPreviewTarget: (nodeId: string | null) => void;
  /** Choose the head; opens the RelationshipQuickPicker (sets relationshipDraft). */
  completeVisualLink: (headId: string) => void;
  /** Abandon any in-progress visual link or relationship draft. */
  cancelVisualLink: () => void;
  /** Confirm the relationship draft with a chosen role (flows to attachNodeTo). */
  confirmRelationshipDraft: (type: SyntacticRole) => void;
  /** Replace the multi-selected token range (phrase grouping). */
  setSelectedRange: (tokenIds: string[]) => void;
  /** Open a guided edit modal (hosted centrally). */
  openEditModal: (modal: NonNullable<ActiveEditModal>) => void;
  /** Close any open guided edit modal. */
  closeEditModal: () => void;
  // --- contested syntax / alternate readings ---
  /** Open the alternate-readings panel, optionally pre-selecting an issue. */
  openContestedPanel: (issueId?: string) => void;
  /** Hide the panel WITHOUT closing an active preview/comparison. */
  closeContestedPanel: () => void;
  /** Discard an adopted/custom parse and restore the base 1904/WLC tree. */
  restoreBaseParse: () => void;
  /** Select an issue in the panel (clears any prior preview). */
  selectContestedIssue: (issueId: string) => void;
  /** Preview an alternate in the diagram (temporary; never saved). Null = base. */
  previewAlternateReading: (readingId: string | null) => void;
  /** Clear the preview and return to the base parse. */
  returnToBaseReading: () => void;
  /** Set base-only / single-preview / side-by-side. */
  setAlternateDisplayMode: (mode: AlternateDisplayMode) => void;
  /** Toggle linked scrolling between comparison frames. */
  setLinkedScrolling: (value: boolean) => void;
  /** Adopt a structural alternate as the user's custom parse (persists a patch). */
  adoptContestedReading: (readingId: string) => void;
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

/** The verse a passage/sentence title starts on, e.g. "Philippians 1:1–3" → "1:1". */
function startRef(title: string): string {
  const m = title.match(/(\d+:\d+)/);
  return m ? m[1]! : '';
}

/**
 * Re-establish the prev/next sentence navigation after a session restore. A
 * restored passage is rebuilt from its cache without the sibling sentences it
 * was opened alongside, so reload the book/chapter it came from (cheap — the
 * service worker has it) and point the index at the sentence it starts on.
 * Best-effort: the nav simply stays hidden if the reload fails.
 */
async function restoreNavContext(
  doc: KrDocument,
  corpus: Corpus,
  setGntContext: (passages: KrDocument[], index: number) => void,
) {
  try {
    let passages: KrDocument[] | null = null;
    if (corpus === 'gnt') {
      const book = GNT_BOOKS.find((b) => doc.title.startsWith(b.name));
      if (book) passages = await loadGntBook(book);
    } else if (corpus === 'ot') {
      const book = OT_BOOKS.find((b) => doc.title.startsWith(b.name));
      const ch = doc.title.match(/(\d+):\d+/);
      if (book && ch) passages = await loadOtChapter(book, Number(ch[1]));
    }
    if (!passages || passages.length === 0) return;
    const ref = startRef(doc.title);
    const idx = passages.findIndex((p) => startRef(p.title) === ref);
    setGntContext(passages, idx >= 0 ? idx : 0);
  } catch {
    /* Leave the nav hidden if the book can't be reloaded. */
  }
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

  /**
   * For a CROSS-SENTENCE-BOUNDARY issue (one with `mergePassageIds`), build the
   * combined base document of the spanned sentences so the alternate can be shown
   * structurally. Returns null for an ordinary single-sentence issue (consumers
   * then fall back to `baseDoc`), or when the spanned sentences aren't all loaded
   * in the current book context (degrades gracefully to the single sentence).
   */
  const mergedContestedBase = (issue: ContestedSyntaxIssue | undefined): KrDocument | null => {
    if (!issue?.mergePassageIds?.length || issue.mergePassageIds.length < 2) return null;
    const byId = new Map(get().gntPassages.map((d) => [d.id, d] as const));
    const parts = issue.mergePassageIds
      .map((id) => byId.get(id))
      .filter((d): d is KrDocument => Boolean(d));
    if (parts.length !== issue.mergePassageIds.length) return null;
    try {
      return combinePassage(parts);
    } catch {
      return null;
    }
  };

  /** Resolve the contested base for an issue id (or the passage's first issue). */
  const contestedBaseFor = (issueId: string | undefined): KrDocument | null => {
    const base = get().baseDoc ?? get().doc;
    const issue = (issueId && getIssueById(issueId)) || getIssuesForPassage(base)[0];
    return mergedContestedBase(issue);
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
    editTier: 'basic',
    activeEditTool: 'select',
    pendingLinkStart: null,
    linkPreviewTarget: null,
    relationshipDraft: null,
    selectedRange: [],
    editModal: null,
    contested: {
      showAlternateParsePanel: false,
      alternateDisplayMode: 'base-only',
      linkedScrolling: true,
    },
    contestedBaseDoc: null,
    previewDoc: null,
    verticalScale: 1,
    diagramMode: DEFAULT_MODE,
    glossMode: false,
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
        previewDoc: null,
        contestedBaseDoc: null,
        contested: { ...FRESH_CONTESTED },
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
        previewDoc: null,
        contestedBaseDoc: null,
        contested: { ...FRESH_CONTESTED },
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
        previewDoc: null,
        contestedBaseDoc: null,
        contested: { ...FRESH_CONTESTED },
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
        previewDoc: null,
        contestedBaseDoc: null,
        contested: { ...FRESH_CONTESTED },
        status: 'saved',
      });
      // Rebuild prev/next sentence navigation for a restored gold-standard
      // passage (the sibling list isn't part of the cached document).
      const corpus = corpusFor(next);
      if (corpus !== 'custom') void restoreNavContext(next, corpus, get().setGntContext);
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
        set({ doc: live, sermon, past: [], future: [], selection: {}, linking: null, previewDoc: null, contestedBaseDoc: null, contested: { ...FRESH_CONTESTED }, status: 'saved' });
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

    cleanLayout: () => {
      if (!Object.keys(get().doc.layoutHints).length) return; // nothing to clean
      commit((d) => ({ ...d, layoutHints: {} }));
    },

    // --- grouping (phrase/block) -------------------------------------------
    groupTokens: (tokenIds) => {
      const ids = [...new Set(tokenIds)];
      if (ids.length < 2) return;
      const newNodeId = makeId('node');
      const newRelId = makeId('rel');
      commit((d) => {
        const idx = new Map(d.tokens.map((t) => [t.id, t.index]));
        // Only group real tokens; bail unless they all resolve to word nodes.
        const present = ids.filter((id) => idx.has(id));
        if (present.length < 2) return d;
        const tokenToNode = new Map<string, string>();
        for (const n of d.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);
        const sourceNodeIds = [...new Set(present.map((t) => tokenToNode.get(t)).filter((x): x is string => Boolean(x)))];
        const sources = sourceNodeIds.map((id) => d.syntax.nodes.find((n) => n.id === id)!);
        // Refuse to group clauses or the root, or nodes that carry extra tokens
        // not in the selection (would silently drop words).
        if (sources.some((n) => n.kind !== 'word' || n.id === d.syntax.rootId)) return d;
        if (sources.some((n) => n.tokenIds.some((t) => !present.includes(t)))) return d;

        // The new phrase attaches where the earliest (surface-order) source did.
        const ordered = [...sources].sort(
          (a, b) =>
            Math.min(...a.tokenIds.map((t) => idx.get(t) ?? Infinity)) -
            Math.min(...b.tokenIds.map((t) => idx.get(t) ?? Infinity)),
        );
        const first = ordered[0]!;
        const removed = new Set(sourceNodeIds);

        // The attach point is the first ancestor of `first` that is NOT itself
        // being grouped (so grouping a parent together with its child still lands
        // the new phrase on a surviving node, not a removed one).
        let attach = d.syntax.relations.find((r) => r.dependentId === first.id);
        while (attach && removed.has(attach.headId)) {
          attach = d.syntax.relations.find((r) => r.dependentId === attach!.headId);
        }
        const parentHeadId = attach && !removed.has(attach.headId) ? attach.headId : d.syntax.rootId;
        const parentType = attach?.type ?? 'adjunct';

        const newNode: SyntaxNode = {
          id: newNodeId,
          kind: 'word',
          role: parentType,
          tokenIds: present.sort((a, b) => (idx.get(a) ?? 0) - (idx.get(b) ?? 0)),
          provenance: MANUAL,
        };
        const nodes = [...d.syntax.nodes.filter((n) => !removed.has(n.id)), newNode];

        const relations = d.syntax.relations
          // Drop relations that pointed INTO a removed node from outside the group.
          .filter((r) => !removed.has(r.dependentId))
          // Re-point surviving children of removed nodes onto the new phrase node.
          .map((r) => (removed.has(r.headId) ? { ...r, headId: newNodeId } : r))
          // Avoid a self-loop if a child also happened to be in the group.
          .filter((r) => r.headId !== r.dependentId);

        relations.push({
          id: newRelId,
          type: parentType,
          headId: parentHeadId,
          dependentId: newNodeId,
          provenance: MANUAL,
        });
        return { ...d, syntax: { ...d.syntax, nodes, relations } };
      });
      set({ selection: { nodeId: newNodeId }, selectedRange: [] });
    },

    ungroupNode: (nodeId) => {
      commit((d) => {
        const node = d.syntax.nodes.find((n) => n.id === nodeId);
        if (!node || node.kind !== 'word' || node.tokenIds.length < 2) return d;
        const idx = new Map(d.tokens.map((t) => [t.id, t.index]));
        const toks = [...node.tokenIds].sort((a, b) => (idx.get(a) ?? 0) - (idx.get(b) ?? 0));
        const parentRel = d.syntax.relations.find((r) => r.dependentId === nodeId);
        const [keep, ...rest] = toks;
        // The original node keeps the first token (and its children/parent edge).
        let nodes = d.syntax.nodes.map((n) => (n.id === nodeId ? { ...n, tokenIds: [keep!] } : n));
        const relations = [...d.syntax.relations];
        for (const t of rest) {
          const splitId = makeId('node');
          nodes = [
            ...nodes,
            { id: splitId, kind: 'word', role: parentRel?.type, tokenIds: [t], provenance: MANUAL },
          ];
          relations.push({
            id: makeId('rel'),
            type: parentRel?.type ?? 'adjunct',
            headId: parentRel?.headId ?? d.syntax.rootId,
            dependentId: splitId,
            provenance: MANUAL,
          });
        }
        return { ...d, syntax: { ...d.syntax, nodes, relations } };
      });
    },

    select: (selection) => set({ selection }),

    setVerticalScale: (scale) => set({ verticalScale: Math.min(2.5, Math.max(0.6, scale)) }),

    setDiagramMode: (mode) =>
      set({
        diagramMode: mode,
        // Mode-specific tools don't carry over; reset any in-progress link.
        activeEditTool: 'select',
        pendingLinkStart: null,
        linkPreviewTarget: null,
        relationshipDraft: null,
        selectedRange: [],
      }),

    // --- tier-aware editing -------------------------------------------------
    setEditTier: (tier) =>
      set({
        editTier: tier,
        activeEditTool: 'select',
        pendingLinkStart: null,
        linkPreviewTarget: null,
        relationshipDraft: null,
      }),

    setActiveEditTool: (tool) =>
      set({
        activeEditTool: tool,
        pendingLinkStart: null,
        linkPreviewTarget: null,
        relationshipDraft: null,
      }),

    startVisualLink: (dependentId) =>
      set({ pendingLinkStart: dependentId, linkPreviewTarget: null, relationshipDraft: null }),

    setLinkPreviewTarget: (nodeId) => set({ linkPreviewTarget: nodeId }),

    completeVisualLink: (headId) => {
      const { pendingLinkStart } = get();
      if (!pendingLinkStart || pendingLinkStart === headId) return;
      set({
        relationshipDraft: { dependentId: pendingLinkStart, headId },
        pendingLinkStart: null,
        linkPreviewTarget: null,
      });
    },

    cancelVisualLink: () =>
      set({ pendingLinkStart: null, linkPreviewTarget: null, relationshipDraft: null }),

    confirmRelationshipDraft: (type) => {
      const { relationshipDraft } = get();
      if (!relationshipDraft) return;
      const { dependentId } = relationshipDraft;
      get().attachNodeTo(relationshipDraft.dependentId, relationshipDraft.headId, type);
      set({ relationshipDraft: null, selection: { nodeId: dependentId } });
    },

    setSelectedRange: (tokenIds) => set({ selectedRange: tokenIds }),

    setGlossMode: (value) => set({ glossMode: value }),

    openEditModal: (modal) => set({ editModal: modal }),
    closeEditModal: () => set({ editModal: null }),

    // --- contested syntax / alternate readings ------------------------------
    openContestedPanel: (issueId) =>
      set((s) => {
        const selectedId = issueId ?? s.contested.selectedContestedIssueId;
        return {
          contestedBaseDoc: contestedBaseFor(selectedId),
          contested: {
            ...s.contested,
            showAlternateParsePanel: true,
            selectedContestedIssueId: selectedId,
          },
        };
      }),

    closeContestedPanel: () =>
      // Only hide the panel; any single-preview or side-by-side comparison stays
      // up (each has its own Return-to-base control) so closing the drawer to see
      // the full comparison doesn't dismiss it.
      set((s) => ({ contested: { ...s.contested, showAlternateParsePanel: false } })),

    restoreBaseParse: () => {
      get().resetPassage({ syntax: true, layout: true });
      set((s) => ({
        previewDoc: null,
        contested: {
          ...s.contested,
          previewAlternateReadingId: undefined,
          alternateDisplayMode: 'base-only',
        },
      }));
    },

    selectContestedIssue: (issueId) =>
      set((s) => ({
        previewDoc: null,
        contestedBaseDoc: contestedBaseFor(issueId),
        contested: {
          ...s.contested,
          selectedContestedIssueId: issueId,
          selectedAlternateReadingId: undefined,
          previewAlternateReadingId: undefined,
          alternateDisplayMode: 'base-only',
        },
      })),

    previewAlternateReading: (readingId) => {
      const reading = readingId ? getReadingById(readingId) : undefined;
      // A cross-boundary reading overlays the COMBINED base of its spanned
      // sentences; an ordinary reading overlays the single-sentence base.
      const merged = reading ? mergedContestedBase(getIssueById(reading.issueId)) : null;
      const base = merged ?? get().baseDoc ?? get().doc;
      const previewDoc = reading ? applyAlternateReadingPreview(base, reading) : null;
      set((s) => ({
        previewDoc,
        contestedBaseDoc: merged ?? s.contestedBaseDoc,
        contested: {
          ...s.contested,
          previewAlternateReadingId: reading?.id,
          selectedAlternateReadingId: reading?.id ?? s.contested.selectedAlternateReadingId,
          alternateDisplayMode: reading
            ? s.contested.alternateDisplayMode === 'base-only'
              ? 'single-preview'
              : s.contested.alternateDisplayMode
            : 'base-only',
        },
      }));
    },

    returnToBaseReading: () =>
      set((s) => ({
        previewDoc: null,
        contested: {
          ...s.contested,
          previewAlternateReadingId: undefined,
          alternateDisplayMode: 'base-only',
        },
      })),

    setAlternateDisplayMode: (mode) => {
      const s = get();
      if (mode === 'base-only') {
        set((st) => ({ previewDoc: null, contested: { ...st.contested, alternateDisplayMode: mode } }));
        return;
      }
      const readingId =
        s.contested.previewAlternateReadingId ?? s.contested.selectedAlternateReadingId;
      const reading = readingId ? getReadingById(readingId) : undefined;
      const merged = reading ? mergedContestedBase(getIssueById(reading.issueId)) : null;
      const base = merged ?? s.baseDoc ?? s.doc;
      const previewDoc = reading ? applyAlternateReadingPreview(base, reading) : s.previewDoc;
      set((st) => ({
        previewDoc,
        contested: {
          ...st.contested,
          alternateDisplayMode: mode,
          previewAlternateReadingId: reading?.id ?? st.contested.previewAlternateReadingId,
        },
      }));
    },

    setLinkedScrolling: (value) =>
      set((s) => ({ contested: { ...s.contested, linkedScrolling: value } })),

    adoptContestedReading: (readingId) => {
      const reading = getReadingById(readingId);
      if (!reading || !reading.syntaxPatch) return; // only structural alternates adopt
      // A cross-boundary reading rewrites the sentence segmentation itself, which
      // the single-passage patch model can't persist — it stays preview/compare only.
      const issue = getIssueById(reading.issueId);
      if (issue && isMergeIssue(issue)) return;
      // Apply onto the CURRENT doc so adoption merges with any prior edits, then
      // commit so the normal patch/diff persistence stores it as a user edit.
      const next = applyAlternateReadingPreview(get().doc, reading);
      commit(() => next);
      set((s) => ({
        previewDoc: null,
        contested: {
          ...s.contested,
          showAlternateParsePanel: false,
          previewAlternateReadingId: undefined,
          alternateDisplayMode: 'base-only',
        },
      }));
    },

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
