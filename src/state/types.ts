import type { KrDocument } from '@/domain/schema';
import type { Inference } from '@/domain/inference';

/** The three application modes from the spec. */
export type AppMode = 'parsed' | 'assisted' | 'manual';

export interface Selection {
  nodeId?: string;
  relationId?: string;
  tokenId?: string;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface EditorState {
  doc: KrDocument;
  mode: AppMode;
  selection: Selection;
  /** Current provisional inferences awaiting accept/reject. */
  inferences: Inference[];
  status: SaveStatus;
  /** Undo/redo stacks (document snapshots). */
  past: KrDocument[];
  future: KrDocument[];
}
