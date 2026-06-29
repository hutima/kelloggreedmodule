import type { KrDocument, SermonPrepData } from '@/domain/schema';
import type { Inference } from '@/domain/inference';
import type { DiagramMode } from '@/domain/layout';

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
  /** User-tunable row spacing (vertical-gap multiplier) for the diagram. */
  verticalScale: number;
  /** Which diagram renderer is active (Kellogg-Reed by default). */
  diagramMode: DiagramMode;
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
  /**
   * True on a device's first-ever launch (no prior session to restore). Drives a
   * friendlier cold start: open to a default passage with the passage selector
   * revealed so it's obvious where to choose a text.
   */
  firstRun: boolean;
  /** User override: force the desktop layout/editing on a small screen. */
  forceDesktop: boolean;
}
