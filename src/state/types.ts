import type { KrDocument, SermonPrepData, SermonAnchor } from '@/domain/schema';
import type { Inference } from '@/domain/inference';
import type { DiagramMode } from '@/domain/layout';
import type { SyntaxSourceId } from '@/io/sources';
import type { DocumentSummary } from '@/persistence';

/**
 * Desktop side-by-side comparison of TWO syntax SOURCES (e.g. Nestle1904 vs
 * OpenText) for the current passage. The secondary source's parse is loaded by
 * the view; the store only holds the toggle + chosen secondary source so the
 * picker control and the diagram stay in sync.
 */
export interface SourceCompareState {
  on: boolean;
  /** The secondary source rendered in the right pane. */
  source: SyntaxSourceId;
}

/**
 * Legacy inference WORKING mode (how a parse is built). Distinct from the
 * user-facing app mode below. Kept for the inference engine / assisted flow.
 */
export type WorkMode = 'parsed' | 'assisted' | 'manual';

/**
 * User-facing application mode — the three top-level experiences from the spec.
 * Explore is the default (especially on mobile); Edit is desktop-first; Sermon
 * Prep is for exegetical preparation. All three are lenses over ONE shared
 * document model.
 */
export type AppMode = 'explore' | 'edit' | 'sermon';

/** Which corpus the current base assignment comes from (for patch identity). */
export type Corpus = 'gnt' | 'ot' | 'custom';

/**
 * Edit tier. The whole editing surface is split in two: BASIC is visual-first,
 * sermon-prep-first, plain-English and mostly click/tap; ADVANCED is technical
 * (full role lists, morphology, manual relation building). Orthogonal to the
 * diagram mode — each visualization offers its own basic and advanced behavior.
 */
export type EditTier = 'basic' | 'advanced';

/**
 * The active Basic-Edit tool, shown in the EditModeToolbar. `select` inspects and
 * shows the contextual popover; `link` draws a relationship word→word; `move`
 * reparents a block by picking a target; `group` merges words into a phrase;
 * `delete` removes the next clicked relation. Which tools apply depends on the
 * diagram mode (see `BasicInteractionConfig`).
 */
export type BasicEditTool = 'select' | 'link' | 'move' | 'group' | 'delete';

/**
 * A relationship being built visually: a dependent and a head have been chosen
 * (by tapping two words) and the user is about to pick the relationship label in
 * the RelationshipQuickPicker. Confirming flows to `attachNodeTo`.
 */
export interface RelationshipDraft {
  dependentId: string;
  headId: string;
}

/**
 * The guided modal currently open, if any. Hosted in the store (not a single
 * component) so any editing surface — the inline popover, the action sheet, the
 * phrase/block workbench, the dependency overlay — can open the same modals
 * through one dispatcher. `null` when no modal is open.
 */
export type ActiveEditModal =
  | { type: 'relation'; dependentId?: string; headId?: string; relationId?: string }
  | { type: 'role'; nodeId: string }
  | { type: 'block'; nodeId: string }
  | { type: 'wordDetails'; nodeId: string }
  | { type: 'quickGloss'; nodeId: string }
  | { type: 'note'; anchor: SermonAnchor }
  | null;

export interface Selection {
  nodeId?: string;
  relationId?: string;
  tokenId?: string;
  /** A glossary term to explain (a tapped diagram label, e.g. `agr`). */
  glossKey?: string;
}

/**
 * An in-progress "click a word to attach it" interaction. While set, the next
 * node clicked in the diagram becomes the chosen end of the relation.
 */
export interface Linking {
  relationId: string;
  end: 'head' | 'dependent';
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * How an alternate reading is shown. `base-only` = the 1904/WLC parse alone;
 * `single-preview` = the selected alternate replaces the one diagram frame
 * (temporary, never saved); `side-by-side` = base and alternate in two linked
 * frames (desktop only). Mobile is restricted to base-only / single-preview.
 */
export type AlternateDisplayMode = 'base-only' | 'single-preview' | 'side-by-side';

/** UI state for the contested-syntax / alternate-readings feature. */
export interface ContestedUiState {
  /** The contested issue whose panel is open, if any. */
  selectedContestedIssueId?: string;
  /** The alternate reading chosen in the panel (not necessarily previewed). */
  selectedAlternateReadingId?: string;
  /** The alternate currently PREVIEWED in the diagram (temporary, unsaved). */
  previewAlternateReadingId?: string;
  /** Whether the alternate-readings panel/sheet is open. */
  showAlternateParsePanel: boolean;
  alternateDisplayMode: AlternateDisplayMode;
  /** Sync scroll/pan between the two comparison frames (desktop). */
  linkedScrolling: boolean;
}

export interface EditorState {
  doc: KrDocument;
  /**
   * The pristine base (gold-standard) assignment for the current passage, if it
   * came from source data. User edits are diffed against this and stored as a
   * compact patch. `null` for brand-new custom documents (no base to diff).
   */
  baseDoc: KrDocument | null;
  corpus: Corpus;
  /** Sermon-prep data for the current passage (notes, highlights, outline). */
  sermon: SermonPrepData;
  /** Legacy inference working mode. */
  mode: WorkMode;
  /** User-facing app mode: Explore / Edit / Sermon Prep. */
  appMode: AppMode;
  selection: Selection;
  /** Active click-to-relink interaction, if any. */
  linking: Linking | null;
  /** Basic vs Advanced editing surface (Basic by default). */
  editTier: EditTier;
  /** The active Basic-Edit tool (Select by default). */
  activeEditTool: BasicEditTool;
  /**
   * The first word tapped while the Link tool is active: it becomes the
   * DEPENDENT of the relationship once a head is tapped. `null` when no link is
   * in progress.
   */
  pendingLinkStart: string | null;
  /** The node currently hovered as a candidate head, for the link preview arc. */
  linkPreviewTarget: string | null;
  /** A relationship awaiting its label in the RelationshipQuickPicker. */
  relationshipDraft: RelationshipDraft | null;
  /** Token ids currently multi-selected for grouping into a phrase/block. */
  selectedRange: string[];
  /** The guided edit modal currently open (hosted centrally), if any. */
  editModal: ActiveEditModal;
  /** Contested-syntax / alternate-readings UI state. */
  contested: ContestedUiState;
  /**
   * The document the contested-syntax system treats as the BASE for the active
   * issue. Normally this is just `baseDoc`, but for a cross-sentence-boundary
   * issue (one with `mergePassageIds`, e.g. Romans 9:5's doxology) it is the
   * COMBINED document of the spanned sentences, so the alternate can be shown
   * structurally instead of as a footnote. `null` when no merge is in effect
   * (consumers fall back to `baseDoc ?? doc`). In-memory only.
   */
  contestedBaseDoc: KrDocument | null;
  /**
   * The document to RENDER for a single-frame alternate preview (the base with
   * the alternate overlay applied). In-memory only — previewing never persists.
   * `null` when showing the base.
   */
  previewDoc: KrDocument | null;
  /** User-tunable row spacing (vertical-gap multiplier) for the diagram. */
  verticalScale: number;
  /** Which diagram renderer is active (Kellogg-Reed by default). */
  diagramMode: DiagramMode;
  /** Desktop side-by-side comparison of two syntax sources. */
  sourceCompare: SourceCompareState;
  /**
   * Show English glosses instead of the Greek/Hebrew words in the structural
   * diagrams (Kellogg-Reed / Phrase-Block / Dependency). The PARSE stays the
   * Greek one — only the displayed words change — so non-Greek readers can follow
   * the structure. Morphology stays in the source language (it's a form study).
   */
  glossMode: boolean;
  /**
   * Tint words by grammatical category (case / finite verb / participle) in the
   * Kellogg-Reed and Phrase/Block diagrams, using the SAME palette as the
   * Morphology Clause mode. Off by default; toggled near the Greek/English toggle.
   * Morphology is always coloured (it's a form study), so this flag never affects it.
   */
  colorMode: boolean;
  /** Current provisional inferences awaiting accept/reject. */
  inferences: Inference[];
  status: SaveStatus;
  /** Undo/redo stacks (document snapshots). */
  past: KrDocument[];
  future: KrDocument[];
  /** The loaded GNT book's sentences, for prev/next sentence navigation. */
  gntPassages: KrDocument[];
  /** Index into `gntPassages` of the first sentence currently shown (-1 = none). */
  gntIndex: number;
  /** Whether the left (sources) panel is collapsed to a thin strip. */
  leftCollapsed: boolean;
  /** Saved custom parses ("my sentences"), most-recent first. Drives the New tab. */
  customParses: DocumentSummary[];
  /** Edit-mode before/after: show the original parse beside the current edits. */
  compareToBase: boolean;
  /**
   * True on a device's first-ever launch (no prior session to restore). Drives a
   * friendlier cold start: open to a default passage with the passage selector
   * revealed so it's obvious where to choose a text.
   */
  firstRun: boolean;
  /** User override: force the desktop layout/editing on a small screen. */
  forceDesktop: boolean;
}
