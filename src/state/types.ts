import type { KrDocument } from '@/domain/schema';
import type { Inference } from '@/domain/inference';

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
  /** Current provisional inferences awaiting accept/reject. */
  inferences: Inference[];
  status: SaveStatus;
  /** Undo/redo stacks (document snapshots). */
  past: KrDocument[];
  future: KrDocument[];
}
