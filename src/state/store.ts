import { create } from 'zustand';
import type {
  KrDocument,
  Language,
  Relation,
  SyntaxNode,
  SyntaxModel,
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
  clauseAncestor,
  createDocument,
  detachNode,
  getNode,
  headForRole,
  headForRoleInClause,
  makeId,
  normalizeSyntax,
  parentRelations,
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
  deletePatch,
  applyStoredPatch,
  saveSermonPrep,
  loadSermonPrep,
  deleteSermonPrep,
  saveCustomParse,
  listCustomParses,
  getCustomParse,
  deleteCustomParse,
  loadUserVariants,
  saveUserVariants,
  deleteUserVariants,
} from '@/persistence';
import { diffDocuments, hashBase } from '@/domain/patch';
import { isEmptySyntaxPatch } from '@/domain/schema';
import { cloneSample } from '@/fixtures';
import { DEFAULT_MODE, type DiagramMode, type TreeOrientation } from '@/domain/layout';
import { loadForceDesktop, saveForceDesktop } from '@/ui/responsive/viewport';
import { scheduleAutosave } from './autosave';
import {
  applyAlternateReadingPreview,
  getReadingById,
  getIssueById,
  getIssuesForPassage,
  isMergeIssue,
  setUserContested,
  buildUserVariants,
  mergeUserVariants,
  userIssueId,
  type VariantInput,
} from '@/domain/contested';
import {
  combinePassage,
  loadGntBook,
  loadOpenTextBook,
  loadOtChapter,
  GNT_BOOKS,
  OPENTEXT_BOOKS,
  OT_BOOKS,
  sourceOfDoc,
  sourceIdForCorpus,
  type SyntaxSourceId,
} from '@/io';
import type { ContestedSyntaxIssue } from '@/domain/schema';
import type {
  ActiveEditModal,
  AlternateDisplayMode,
  AppMode,
  BasicEditTool,
  Corpus,
  EditorState,
  EditTier,
  SearchPrefill,
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
 * Load the imported variant readings stored for `passageId` and register them as
 * the runtime contested overlay, so the badge / panel / dropdown surface them for
 * the passage now in view. Cleared (empty overlay) when the passage has none.
 */
function registerUserVariants(passageId: string): void {
  const bundle = loadUserVariants(passageId);
  setUserContested(bundle ? [bundle.issue] : [], bundle ? bundle.readings : []);
}

/**
 * A reading label for a base parse being DEMOTED (when another reading is promoted
 * to base). A primary parse's title is just the opening words of the sentence,
 * which reads poorly as a reading label — so fall back to a clear generic name.
 */
function demotedBaseLabel(doc: KrDocument): string {
  const title = doc.title?.trim();
  const stem = title?.replace(/…$/, '').trim();
  if (!title || (stem && doc.text.trim().startsWith(stem))) return 'Previous base parse';
  return title;
}

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

/**
 * Persisted view preferences (best-effort localStorage; tests / private mode just
 * fall back to the default). Kept tiny and explicit, mirroring `forceDesktop`.
 */
const TREE_ORIENTATION_KEY = 'kr:treeOrientation';
function loadTreeOrientation(): TreeOrientation {
  if (typeof localStorage === 'undefined') return 'horizontal';
  try {
    return localStorage.getItem(TREE_ORIENTATION_KEY) === 'vertical' ? 'vertical' : 'horizontal';
  } catch {
    return 'horizontal';
  }
}
function saveTreeOrientation(value: TreeOrientation): void {
  if (typeof localStorage === 'undefined') return;
  try {
    // 'horizontal' is the default, so store only the override.
    if (value === 'vertical') localStorage.setItem(TREE_ORIENTATION_KEY, 'vertical');
    else localStorage.removeItem(TREE_ORIENTATION_KEY);
  } catch {
    /* ignore */
  }
}

const FLIP_DIAGRAM_KEY = 'kr:flipDiagram';
function loadFlipDiagram(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(FLIP_DIAGRAM_KEY) === '1';
  } catch {
    return false;
  }
}
function saveFlipDiagram(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) localStorage.setItem(FLIP_DIAGRAM_KEY, '1');
    else localStorage.removeItem(FLIP_DIAGRAM_KEY);
  } catch {
    /* ignore */
  }
}

const VERSES_IN_PANEL_KEY = 'kr:versesInPanel';
function loadVersesInPanel(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(VERSES_IN_PANEL_KEY) === '1';
  } catch {
    return false;
  }
}
function saveVersesInPanel(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) localStorage.setItem(VERSES_IN_PANEL_KEY, '1');
    else localStorage.removeItem(VERSES_IN_PANEL_KEY);
  } catch {
    /* ignore */
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

/**
 * The MAIN clause whose predicate a "make main verb" edit targets: the root if
 * it is itself a subject/predicate clause, else (a headless coordinate/discourse
 * root) the first clause member. Falls back to the root id.
 */
function mainClauseId(syntax: KrDocument['syntax']): string {
  const rootId = syntax.rootId;
  const rootHasCore = syntax.relations.some(
    (r) => r.headId === rootId && (r.type === 'subject' || r.type === 'predicate' || r.type === 'copula'),
  );
  if (rootHasCore || getNode(syntax, rootId)?.kind !== 'clause') return rootId;
  const member = syntax.relations.find(
    (r) => r.headId === rootId && r.type === 'conjunct' && getNode(syntax, r.dependentId)?.kind === 'clause',
  );
  return member?.dependentId ?? rootId;
}

/** Clause slots that hold exactly ONE filler — assigning a new one REPLACES it. */
const SINGLE_FILLER: Partial<Record<SyntacticRole, SyntacticRole[]>> = {
  subject: ['subject'],
  predicate: ['predicate', 'copula'],
  copula: ['predicate', 'copula'],
};

/**
 * When `nodeId` takes a single-occupancy clause slot (subject / predicate) on
 * `headId`, evict the current filler so the slot isn't doubled: the displaced
 * filler takes the incoming node's vacated role + head (a SWAP, when the incoming
 * node had a prior relation `incoming`), or — if it was only an implied
 * placeholder — is removed. This is what makes "replace the subject/verb in a
 * clause" and "swap words between clauses" one tap.
 */
function replaceFiller(
  syntax: SyntaxModel,
  base: SyntaxModel,
  nodeId: string,
  role: SyntacticRole,
  headId: string,
  incoming: Relation | undefined,
): SyntaxModel {
  const slot = SINGLE_FILLER[role];
  if (!slot) return syntax;
  const existing = base.relations.find(
    (r) => r.headId === headId && slot.includes(r.type) && r.dependentId !== nodeId,
  );
  if (!existing) return syntax;
  const existingImplied = base.nodes.find((n) => n.id === existing.dependentId)?.implied;
  if (existingImplied) return removeRelation(syntax, existing.id);
  if (incoming && incoming.headId !== headId) {
    const swapped = mUpdateRelation(syntax, existing.id, {
      type: incoming.type,
      headId: incoming.headId,
      provenance: MANUAL,
    });
    return mUpdateNode(swapped, existing.dependentId, { role: incoming.type, provenance: MANUAL });
  }
  // Incoming had no prior slot (or came from the same head): the old filler can't
  // simply trade places, so demote it to a loose adjunct the user can re-place.
  return mUpdateRelation(syntax, existing.id, { type: 'adjunct', provenance: MANUAL });
}

export interface EditorActions {
  // lifecycle
  newDocument: (language: Language, title?: string) => void;
  /** Create a fresh custom document from typed text, auto-tagged (tokenized +
   *  inference-seeded) so the diagram is populated and ready to edit. */
  createFromText: (text: string, language: Language) => void;
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
  /** Queue (or clear) a search to run from the Search tab — a word's lemma /
   *  Strong's clicked in the inspector. The Search panel consumes and clears it. */
  setSearchPrefill: (prefill: SearchPrefill | null) => void;
  /** Flag which contested issues belong to the sentences making up the current
   *  multi-sentence selection (set by the GNT/OT pickers on Open; cleared by
   *  `loadDocument` for every ordinary load). */
  setMultiSentenceContested: (issues: ContestedSyntaxIssue[]) => void;
  /** Load the sentence `delta` away in the current GNT book (prev/next). */
  stepGnt: (delta: number) => void;
  // saved custom parses ("my sentences")
  /** Save the current document to the custom-parse list (keeps it across sessions). */
  saveCurrentAsCustom: () => void;
  /** Save the current sentence AND its imported variant readings as one custom sentence. */
  saveWithVariants: () => void;
  /** Re-read the saved custom-parse list from storage into state. */
  refreshCustomParses: () => void;
  /** Open a saved custom parse as the active document. */
  openCustomParse: (id: string) => void;
  /** Delete a saved custom parse. */
  removeCustomParse: (id: string) => void;
  /** Toggle the edit-mode before/after comparison (original parse vs current edits). */
  toggleCompareToBase: (value?: boolean) => void;
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
  /** Add a BLANK new word (empty token, drawn as a "＋" placeholder) and open the
   *  lexeme search so the user assigns it a Greek/Hebrew Strong's lemma — the way
   *  to author a brand-new word for a textual variant. */
  addBlankWord: () => void;
  /** Place an existing-but-unassigned token on the diagram: make a word node for
   *  it, attach it to the currently-selected clause (or the root), and select it
   *  so it can be re-roled / relinked. */
  placeToken: (tokenId: string) => void;
  /** Delete a word node, its token(s), and any relations touching it. */
  removeWord: (nodeId: string) => void;
  /**
   * Step ONE of the two-step delete: take a word OFF the diagram without deleting
   * its token. The node is removed (children re-homed onto its parent) and the
   * token becomes UNASSIGNED, so it returns to the word bank to be re-placed or
   * deleted for good. Better fits the uncertainty of editing than an outright wipe.
   */
  detachWord: (nodeId: string) => void;
  /** Step TWO of the two-step delete: remove an (unassigned) token for good. */
  removeToken: (tokenId: string) => void;
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
  /**
   * Add a fresh independent clause with empty (implied) subject + verb slots,
   * selecting it so the user can fill the slots from the word bank. Attaches it
   * as a coordinate member: to a headless coordinate/discourse root directly, or
   * by wrapping a single existing clause in a new coordinate root.
   */
  addClause: () => void;
  /**
   * Make `nodeId` the MAIN clause's predicate (verb). If a real verb already
   * fills that slot the two SWAP — the old verb takes the picked word's former
   * role/head — so a misparsed main verb can be corrected without losing it. An
   * implied placeholder is simply dropped.
   */
  setMainPredicate: (nodeId: string) => void;
  /** Attach `dependentId` under `headId` as `type` (re-pointing its head). */
  attachNodeTo: (dependentId: string, headId: string, type: SyntacticRole) => void;
  /**
   * Assign a word to a chosen clause, keeping its current role: subject/verb (and
   * ordinary members) hang off the clause; verbal complements hang off the
   * clause's verb. This is the workflow's explicit "relate to a clause" step, so a
   * freshly-placed word can be homed in the right clause regardless of where it
   * was first dropped.
   */
  assignToClause: (nodeId: string, clauseId: string) => void;
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
  /** Tree visualizations: switch between left-to-right and top-down growth. */
  setTreeOrientation: (value: TreeOrientation) => void;
  /** Desktop: move the verses strip between the center canvas and the right panel. */
  setVersesInPanel: (value: boolean) => void;
  /** Register (or clear) the right-panel element that hosts the verses strip. */
  setVersesHost: (el: HTMLElement | null) => void;
  /** Flip the KR / Phrase-Block diagram horizontally (mirror an RTL doc to LTR). */
  setFlipDiagram: (value: boolean) => void;
  /** Toggle English-gloss display in the structural diagrams. */
  setGlossMode: (value: boolean) => void;
  /** Toggle grammar-colour tinting in the Kellogg-Reed / Phrase-Block diagrams. */
  setColorMode: (value: boolean) => void;
  /** Prefer the app's own difference detection over any LLM-supplied diff words. */
  setPreferAppDiff: (value: boolean) => void;
  /** Desktop: turn the two-source side-by-side comparison on/off. */
  toggleSourceCompare: (on?: boolean) => void;
  /** Desktop: choose the secondary source shown in the comparison's right pane. */
  setCompareSource: (id: SyntaxSourceId) => void;
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
  /**
   * Attach imported parses as full-doc alternate readings of a passage (the
   * current doc by default), persist them, and surface them in the dropdown.
   */
  importAsVariants: (variants: VariantInput[], opts?: { targetDoc?: KrDocument }) => void;
  /** Delete one imported variant reading of the current passage (persisted). */
  deleteImportedVariant: (readingId: string) => void;
  /**
   * Promote an imported variant reading to BE the base parse. The chosen reading
   * becomes the new base (a fresh custom sentence), the outgoing base is demoted to
   * a reading, and the remaining readings carry over — so every reading now diffs
   * against a consistent (LLM-tokenized) base and difference analysis is coherent.
   */
  promoteReadingToBase: (readingId: string) => void;
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
      // A GNT passage can come from either syntax source (the document id says
      // which); the siblings must be reloaded from the SAME source, or prev/next
      // would silently step through the other analysis.
      if (sourceOfDoc(doc) === 'opentext') {
        const book = OPENTEXT_BOOKS.find((b) => doc.title.startsWith(b.name));
        if (book) passages = await loadOpenTextBook(book);
      } else {
        const book = GNT_BOOKS.find((b) => doc.title.startsWith(b.name));
        if (book) passages = await loadGntBook(book);
      }
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
      {
        corpus,
        passageId: baseDoc.id,
        // Explicit edition-aware source id, so a patch can never be applied
        // to another edition's base without notice (guard lands in phase 12).
        sourceId: sourceIdForCorpus(baseDoc, corpus),
        baseHash: hashBase(baseDoc),
      },
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
    treeOrientation: loadTreeOrientation(),
    versesInPanel: loadVersesInPanel(),
    versesHost: null,
    sourceCompare: { on: false, source: 'opentext' },
    flipDiagram: loadFlipDiagram(),
    glossMode: false,
    colorMode: true,
    preferAppDiff: false,
    inferences: [],
    status: 'idle',
    past: [],
    future: [],
    gntPassages: [],
    gntIndex: -1,
    leftCollapsed: false,
    searchPrefill: null,
    customParses: [],
    compareToBase: false,
    firstRun: isFirstRun(),
    forceDesktop: loadForceDesktop(),
    multiSentenceContested: [],
    variantsVersion: 0,

    setGntContext: (passages, index) => set({ gntPassages: passages, gntIndex: index }),
    setMultiSentenceContested: (issues) => set({ multiSentenceContested: issues }),
    setLeftCollapsed: (collapsed) => set({ leftCollapsed: collapsed }),
    // Also un-collapses the left panel: on mobile it's the sources drawer, which
    // only mounts (and can only react to the prefill) once it's open — so this
    // has to open it directly rather than rely on LeftPanel's own effect.
    setSearchPrefill: (prefill) => set(prefill ? { searchPrefill: prefill, leftCollapsed: false } : { searchPrefill: prefill }),
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
      const live0 = applyStoredPatch(base);
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
        multiSentenceContested: [],
        status: 'saved',
      });
      registerUserVariants(base.id);
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
        multiSentenceContested: [],
        status: 'idle',
      });
      scheduleAutosave(doc, (status) => set({ status }));
    },

    createFromText: (text, language) => {
      // A new custom document seeded from typed text: tokenize, then run the
      // inference engine to a fixed point (idempotent upserts) so the diagram is
      // populated with a rough, fully-editable parse rather than an empty line.
      const title = text.trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 50) || 'New diagram';
      const baseDoc0 = createDocument({ language, text, title });
      let d: KrDocument = { ...baseDoc0, tokens: tokenize(text, language) };
      for (let pass = 0; pass < 4; pass++) {
        const { inferences } = runInference(d);
        if (!inferences.length) break;
        const size = d.syntax.nodes.length + d.syntax.relations.length;
        d = applyInferences(d, inferences);
        if (d.syntax.nodes.length + d.syntax.relations.length === size) break;
      }
      // The rough auto-parse can double-assign a token or hang it under two heads
      // (weak English tagging); normalize so no word is drawn twice.
      d = normalizeSyntax(d);
      set({
        doc: d,
        baseDoc: null,
        corpus: 'custom',
        sermon: emptySermonPrep(d.id, d.createdAt),
        past: [],
        future: [],
        inferences: [],
        selection: {},
        linking: null,
        previewDoc: null,
        contestedBaseDoc: null,
        contested: { ...FRESH_CONTESTED },
        multiSentenceContested: [],
        status: 'idle',
      });
      registerUserVariants(d.id);
      scheduleAutosave(d, (status) => set({ status }));
    },

    saveCurrentAsCustom: () => {
      const doc = touch(get().doc);
      set({ doc });
      void saveCustomParse(doc)
        .then(() => get().refreshCustomParses())
        .catch(() => {});
    },

    saveWithVariants: () => {
      const src = get().doc;
      // A custom sentence — fresh OR reopened (reopening sets `baseDoc` to the
      // standalone doc itself, so `baseDoc` can't discriminate) — keeps its id,
      // so its variants (keyed by that id) come back on reopen: just persist the
      // doc, updating any existing "My sentences" entry in place.
      if (get().corpus === 'custom') {
        get().saveCurrentAsCustom();
        return;
      }
      // A source passage (GNT/WLC) is copied to a NEW standalone custom sentence
      // that owns the base + all its imported readings, re-keyed to the new id.
      const bundle = loadUserVariants(src.id);
      const variants: VariantInput[] = bundle
        ? bundle.readings
            .filter((r) => r.fullDoc)
            .map((r) => ({
              label: r.label,
              ...(r.impact ? { impact: r.impact } : {}),
              ...(r.diffWords?.length ? { diffWords: r.diffWords } : {}),
              doc: r.fullDoc!,
            }))
        : [];
      const doc = touch({ ...src, id: makeId('doc') });
      if (variants.length) {
        saveUserVariants(doc.id, buildUserVariants(doc.id, doc.title, variants));
        set((s) => ({ variantsVersion: s.variantsVersion + 1 }));
      }
      void saveCustomParse(doc)
        .then(() => get().refreshCustomParses())
        .catch(() => {});
      get().loadDocument(doc, { corpus: 'custom' });
    },

    refreshCustomParses: () => {
      void listCustomParses()
        .then((customParses) => set({ customParses }))
        .catch(() => {});
    },

    openCustomParse: (id) => {
      void getCustomParse(id)
        .then((doc) => {
          if (doc) get().loadDocument(doc, { corpus: 'custom' });
        })
        .catch(() => {});
    },

    removeCustomParse: (id) => {
      void deleteCustomParse(id)
        .then(() => get().refreshCustomParses())
        .catch(() => {});
    },

    toggleCompareToBase: (value) =>
      set((s) => ({ compareToBase: value ?? !s.compareToBase })),

    loadDocument: (doc, opts) => {
      // The given doc is the pristine BASE; user edits are reconstructed on top.
      const base = doc;
      const live0 = applyStoredPatch(base);
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
        multiSentenceContested: [],
        // The prev/next reading context belongs to the book the previous passage
        // came from; a caller that opens FROM a book (the pickers, search) sets
        // it again right after loading, so a plain load must not keep it.
        gntPassages: [],
        gntIndex: -1,
        status: 'saved',
      });
      registerUserVariants(base.id);
      void saveBase(base).catch(() => {});
      persistOpened(live);
    },

    restoreLastSession: async () => {
      // Load the saved custom-parse list (drives the New tab's availability).
      get().refreshCustomParses();
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
        multiSentenceContested: [],
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
        const live0 = applyStoredPatch(baseDoc);
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

    addBlankWord: () => {
      const tokenId = makeId('tok');
      const nodeId = makeId('node');
      const manual = { source: 'manual', confidence: 'high' } as const;
      commit((d) => {
        // A blank token — no surface/lemma/gloss yet. The node carries a "＋"
        // label so the empty word still draws (and is tappable) on the diagram
        // until a lexeme is assigned; nodeText prefers the surface once it's set.
        const token: Token = {
          id: tokenId,
          index: d.tokens.length,
          surface: '',
          language: d.language,
          provenance: manual,
        };
        const node: SyntaxNode = {
          id: nodeId,
          kind: 'word',
          tokenIds: [tokenId],
          label: '＋',
          provenance: manual,
        };
        const relation: Relation = {
          id: makeId('rel'),
          type: 'adjunct',
          headId: d.syntax.rootId,
          dependentId: nodeId,
          provenance: manual,
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
      // Select it and open the lexeme search so the user fills it straight away.
      set({ selection: { nodeId }, editModal: { type: 'lexeme', nodeId } });
    },

    placeToken: (tokenId) => {
      const { doc, selection } = get();
      if (!doc.tokens.some((t) => t.id === tokenId)) return;
      // Already on the diagram? Nothing to do.
      if (doc.syntax.nodes.some((n) => n.tokenIds.includes(tokenId))) return;
      // Drop the word into the clause the user is working in: the selected clause
      // itself, or the clause enclosing the selected node, else the root. This is
      // what makes "select a clause → tap a bank word → it lands in that clause"
      // flow, so the new word's role can be set straight away.
      const sel = selection.nodeId ? getNode(doc.syntax, selection.nodeId) : undefined;
      const headId =
        sel?.kind === 'clause'
          ? sel.id
          : (selection.nodeId && clauseAncestor(doc.syntax, selection.nodeId)?.id) || doc.syntax.rootId;
      const nodeId = makeId('node');
      commit((d) => {
        const node: SyntaxNode = {
          id: nodeId,
          kind: 'word',
          tokenIds: [tokenId],
          provenance: { source: 'manual', confidence: 'high' },
        };
        // Attach where the user is working so it's visible immediately; they then
        // re-role / relink it to the right head with the normal edit tools.
        const relation: Relation = {
          id: makeId('rel'),
          type: 'adjunct',
          headId: d.syntax.nodes.some((n) => n.id === headId) ? headId : d.syntax.rootId,
          dependentId: nodeId,
          provenance: { source: 'manual', confidence: 'high' },
        };
        return {
          ...d,
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

    detachWord: (nodeId) => {
      const { doc } = get();
      if (nodeId === doc.syntax.rootId) return; // never detach the root
      commit((d) => ({ ...d, syntax: detachNode(d.syntax, nodeId) }));
      set({ selection: {} });
    },

    removeToken: (tokenId) =>
      commit((d) => {
        // Strip the token from any node that still references it; a word node that
        // empties out (and wasn't an implied placeholder) is removed with its edges.
        const nodes = d.syntax.nodes.map((n) =>
          n.tokenIds.includes(tokenId)
            ? { ...n, tokenIds: n.tokenIds.filter((t) => t !== tokenId) }
            : n,
        );
        const doomed = new Set(
          nodes
            .filter((n) => n.kind === 'word' && n.tokenIds.length === 0 && !n.implied)
            .map((n) => n.id),
        );
        return {
          ...d,
          tokens: reindex(d.tokens.filter((t) => t.id !== tokenId)),
          syntax: {
            ...d.syntax,
            nodes: nodes.filter((n) => !doomed.has(n.id)),
            relations: d.syntax.relations.filter(
              (r) => !doomed.has(r.headId) && !doomed.has(r.dependentId),
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
        // Re-home the node so the diagram actually renders it in the new slot: a
        // verbal complement (direct object, predicate nominative…) must hang off
        // the VERB, not the clause, or the layout never draws it on the baseline
        // — the "set X as direct object did nothing" bug. Clause roles
        // (subject/predicate) hang off the clause. Modifiers keep their head.
        const targetHead = headForRole(d.syntax, nodeId, role);
        if (parent) {
          syntax = mUpdateRelation(syntax, parent.id, {
            type: role,
            ...(targetHead && targetHead !== parent.headId ? { headId: targetHead } : {}),
            provenance: MANUAL,
          });
        } else if (targetHead) {
          syntax = upsertRelation(syntax, {
            id: makeId('rel'),
            type: role,
            headId: targetHead,
            dependentId: nodeId,
            provenance: MANUAL,
          });
        }
        // Replacing a clause's subject/verb: evict (swap) the current filler so
        // the slot isn't doubled.
        if (targetHead) syntax = replaceFiller(syntax, d.syntax, nodeId, role, targetHead, parent);
        return { ...d, syntax };
      }),

    addClause: () => {
      const newClauseId = makeId('node');
      commit((d) => {
        const subjId = makeId('node');
        const verbId = makeId('node');
        const nodes: SyntaxNode[] = [
          ...d.syntax.nodes,
          { id: newClauseId, kind: 'clause', clauseType: 'independent', tokenIds: [], provenance: MANUAL },
          { id: subjId, kind: 'word', role: 'subject', tokenIds: [], implied: true, label: '(subject)', provenance: MANUAL },
          { id: verbId, kind: 'word', role: 'predicate', tokenIds: [], implied: true, label: '(verb)', provenance: MANUAL },
        ];
        const relations: Relation[] = [
          ...d.syntax.relations,
          { id: makeId('rel'), type: 'subject', headId: newClauseId, dependentId: subjId, provenance: MANUAL },
          { id: makeId('rel'), type: 'predicate', headId: newClauseId, dependentId: verbId, provenance: MANUAL },
        ];
        const rootId = d.syntax.rootId;
        const rootHasCore = d.syntax.relations.some(
          (r) => r.headId === rootId && (r.type === 'subject' || r.type === 'predicate' || r.type === 'copula'),
        );
        if (!rootHasCore && getNode(d.syntax, rootId)?.kind === 'clause') {
          // Headless coordinate/discourse root: the new clause is another member.
          relations.push({ id: makeId('rel'), type: 'conjunct', headId: rootId, dependentId: newClauseId, provenance: MANUAL });
          return { ...d, syntax: { ...d.syntax, nodes, relations } };
        }
        // A single existing clause: wrap both in a new coordinate root.
        const wrapId = makeId('node');
        nodes.push({ id: wrapId, kind: 'clause', clauseType: 'coordinate', tokenIds: [], provenance: MANUAL });
        relations.push(
          { id: makeId('rel'), type: 'conjunct', headId: wrapId, dependentId: rootId, provenance: MANUAL },
          { id: makeId('rel'), type: 'conjunct', headId: wrapId, dependentId: newClauseId, provenance: MANUAL },
        );
        return { ...d, syntax: { ...d.syntax, rootId: wrapId, nodes, relations } };
      });
      get().select({ nodeId: newClauseId });
    },

    setMainPredicate: (nodeId) =>
      commit((d) => {
        const mainId = mainClauseId(d.syntax);
        const targetRel = d.syntax.relations.find((r) => r.dependentId === nodeId);
        const existingRel = d.syntax.relations.find(
          (r) => r.headId === mainId && (r.type === 'predicate' || r.type === 'copula') && r.dependentId !== nodeId,
        );
        let syntax = mUpdateNode(d.syntax, nodeId, { role: 'predicate', provenance: MANUAL });
        if (targetRel) {
          syntax = mUpdateRelation(syntax, targetRel.id, { type: 'predicate', headId: mainId, provenance: MANUAL });
        } else {
          syntax = upsertRelation(syntax, { id: makeId('rel'), type: 'predicate', headId: mainId, dependentId: nodeId, provenance: MANUAL });
        }
        if (existingRel) {
          const existing = getNode(d.syntax, existingRel.dependentId);
          if (existing?.implied) {
            // A placeholder "(verb)" just makes way for the real one.
            syntax = removeRelation(syntax, existingRel.id);
          } else if (targetRel) {
            // Swap: the displaced verb takes the picked word's former role + head.
            syntax = mUpdateRelation(syntax, existingRel.id, { type: targetRel.type, headId: targetRel.headId, provenance: MANUAL });
            syntax = mUpdateNode(syntax, existingRel.dependentId, { role: targetRel.type, provenance: MANUAL });
          } else {
            // Picked word was unattached: keep the old verb, demoted to an adjunct.
            syntax = mUpdateRelation(syntax, existingRel.id, { type: 'adjunct', provenance: MANUAL });
          }
        }
        return { ...d, syntax };
      }),

    attachNodeTo: (dependentId, headId, type) => {
      if (dependentId === headId) return;
      commit((d) => {
        const parents = d.syntax.relations.filter((r) => r.dependentId === dependentId);
        const incoming = parents[0];
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
        // Attaching into an occupied subject/predicate slot (e.g. moving a word
        // into another clause as its subject) swaps out the current filler.
        syntax = replaceFiller(syntax, d.syntax, dependentId, type, headId, incoming);
        return { ...d, syntax };
      });
    },

    assignToClause: (nodeId, clauseId) => {
      const { doc } = get();
      const clause = getNode(doc.syntax, clauseId);
      if (!clause || clause.kind !== 'clause' || nodeId === clauseId) return;
      const node = getNode(doc.syntax, nodeId);
      // Keep whatever role the word already has (its incoming relation, else its
      // node role, else a loose adjunct); the head is resolved within the chosen
      // clause so verbal complements still land on the verb for the KR baseline.
      const role: SyntacticRole =
        parentRelations(doc.syntax, nodeId)[0]?.type ?? node?.role ?? 'adjunct';
      const head = headForRoleInClause(doc.syntax, clauseId, role);
      get().attachNodeTo(nodeId, head, role);
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

    toggleSourceCompare: (on) => {
      const cur = get().sourceCompare;
      const next = on ?? !cur.on;
      // When switching on, default the secondary pane to the OTHER source than
      // the one the open passage came from, so the two panes differ by default.
      const source =
        next && cur.source === sourceOfDoc(get().doc)
          ? cur.source === 'opentext'
            ? 'macula-greek-nestle1904-lowfat'
            : 'opentext'
          : cur.source;
      set({ sourceCompare: { on: next, source } });
    },
    setCompareSource: (id) => set({ sourceCompare: { ...get().sourceCompare, source: id } }),

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

    setTreeOrientation: (value) => {
      saveTreeOrientation(value);
      set({ treeOrientation: value });
    },
    setVersesInPanel: (value) => {
      saveVersesInPanel(value);
      // Drop any stale host when turning the feature off so the strip falls back
      // to the center canvas immediately.
      set(value ? { versesInPanel: value } : { versesInPanel: value, versesHost: null });
    },
    setVersesHost: (el) => set({ versesHost: el }),
    setFlipDiagram: (value) => {
      saveFlipDiagram(value);
      set({ flipDiagram: value });
    },
    setGlossMode: (value) => set({ glossMode: value }),
    setColorMode: (value) => set({ colorMode: value }),
    setPreferAppDiff: (value) => set({ preferAppDiff: value }),

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

    importAsVariants: (variants, opts) => {
      const target = opts?.targetDoc ?? get().doc;
      const passageId = target.id;
      // Attach the imported parses as full-doc alternate readings of the target
      // passage, MERGING with any already stored, then persist + register so they
      // appear in the reading dropdown / comparison.
      const built = buildUserVariants(passageId, target.title, variants);
      const merged = mergeUserVariants(loadUserVariants(passageId), built);
      saveUserVariants(passageId, merged);
      set((s) => ({ variantsVersion: s.variantsVersion + 1 }));
      if (get().doc.id === passageId) {
        registerUserVariants(passageId);
        set((s) => ({
          contestedBaseDoc: null,
          previewDoc: null,
          contested: {
            ...s.contested,
            showAlternateParsePanel: true,
            selectedContestedIssueId: userIssueId(passageId),
            selectedAlternateReadingId: undefined,
            previewAlternateReadingId: undefined,
            alternateDisplayMode: 'base-only',
          },
        }));
      }
    },

    deleteImportedVariant: (readingId) => {
      const passageId = get().doc.id;
      const bundle = loadUserVariants(passageId);
      if (!bundle) return;
      const readings = bundle.readings.filter((r) => r.id !== readingId);
      if (readings.length) {
        saveUserVariants(passageId, {
          issue: { ...bundle.issue, alternateReadingIds: readings.map((r) => r.id) },
          readings,
        });
      } else {
        deleteUserVariants(passageId); // last one removed → drop the whole issue
      }
      registerUserVariants(passageId);
      set((s) => {
        const wasPreviewing = s.contested.previewAlternateReadingId === readingId;
        return {
          variantsVersion: s.variantsVersion + 1,
          previewDoc: wasPreviewing ? null : s.previewDoc,
          contested: {
            ...s.contested,
            previewAlternateReadingId: wasPreviewing
              ? undefined
              : s.contested.previewAlternateReadingId,
            alternateDisplayMode: wasPreviewing ? 'base-only' : s.contested.alternateDisplayMode,
            selectedContestedIssueId: readings.length
              ? s.contested.selectedContestedIssueId
              : getIssuesForPassage(get().doc)[0]?.id,
            showAlternateParsePanel: readings.length
              ? s.contested.showAlternateParsePanel
              : getIssuesForPassage(get().doc).length > 0 && s.contested.showAlternateParsePanel,
          },
        };
      });
    },

    promoteReadingToBase: (readingId) => {
      const src = get().doc;
      const bundle = loadUserVariants(src.id);
      if (!bundle) return;
      const reading = bundle.readings.find((r) => r.id === readingId);
      if (!reading?.fullDoc) return;

      // The chosen reading becomes the new base. A fresh id gives it a clean patch /
      // notes space, so it never inherits the outgoing base's stored edits.
      const newBase = touch({ ...reading.fullDoc, id: makeId('doc'), title: reading.label });

      // Rebuild the readings for the new base: the OUTGOING base is demoted to a
      // reading (so nothing is lost and it can be re-promoted), plus every other
      // reading except the promoted one. buildUserVariants re-keys them to the new id.
      const variants: VariantInput[] = [
        { label: demotedBaseLabel(src), doc: src },
        ...bundle.readings
          .filter((r) => r.id !== readingId && r.fullDoc)
          .map((r) => ({
            label: r.label,
            ...(r.impact ? { impact: r.impact } : {}),
            ...(r.diffWords?.length ? { diffWords: r.diffWords } : {}),
            doc: r.fullDoc!,
          })),
      ];
      saveUserVariants(newBase.id, buildUserVariants(newBase.id, newBase.title, variants));
      deleteUserVariants(src.id);
      // Persist the promoted base as a custom sentence so it (and its re-keyed
      // readings) survive navigation — the outgoing base's id no longer holds them.
      void saveCustomParse(newBase)
        .then(() => get().refreshCustomParses())
        .catch(() => {});
      get().loadDocument(newBase, { corpus: 'custom' });
      // Reveal the readings panel on the new base.
      set((s) => ({
        variantsVersion: s.variantsVersion + 1,
        contested: {
          ...s.contested,
          showAlternateParsePanel: true,
          selectedContestedIssueId: userIssueId(newBase.id),
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
      // Notes ALSO persist per passage outside the doc (see setNotes); the
      // restored value must be written back there too, or the next load would
      // resurrect the undone notes over the restored doc.
      savePassageNotes(prev.id, prev.notes ?? '');
      persistEdits(prev);
    },

    redo: () => {
      const { future, doc, past } = get();
      const next = future[0];
      if (!next) return;
      set({ doc: next, future: future.slice(1), past: [...past, doc], status: 'saving' });
      scheduleAutosave(next, (status) => set({ status }));
      savePassageNotes(next.id, next.notes ?? '');
      persistEdits(next);
    },

    markSaved: () => set({ status: 'saved' }),
  };
});

/** Convenience selectors. */
export const selectCanUndo = (s: EditorStore) => s.past.length > 0;
export const selectCanRedo = (s: EditorStore) => s.future.length > 0;
export type { Inference };
