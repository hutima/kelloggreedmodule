import type { KrDocument } from '@/domain/schema';
import type { Inference } from '@/domain/inference';
import type { DiagramMode } from '@/domain/layout';

/** The three application modes from the spec. */
export type AppMode = 'parsed' | 'assisted' | 'manual';

export interface Selection {
  nodeId?: string;
  relationId?: string;
  tokenId?: string;
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
  mode: AppMode;
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
}
