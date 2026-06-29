import type { EditorAction } from './types';

/**
 * Contextual action menu for the current selection. Rendered as a bottom sheet
 * on small screens and a floating card on desktop (CSS-driven). The actions are
 * supplied by the active visualization adapter, so what's offered fits what the
 * user is looking at.
 */
export function SelectionActionSheet({
  title,
  actions,
  onAction,
  onClose,
}: {
  title: string | null;
  actions: EditorAction[];
  onAction: (action: EditorAction) => void;
  onClose: () => void;
}) {
  if (!actions.length) return null;
  return (
    <div className="action-sheet" role="dialog" aria-label="Edit actions">
      <div className="action-sheet-head">
        <span className="action-sheet-title">{title ?? 'Edit'}</span>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="action-sheet-body">
        {actions.map((a) => (
          <button
            key={a.id}
            className={`action-item${a.group ? ` group-${a.group}` : ''}`}
            onClick={() => onAction(a)}
          >
            <span className="action-label">{a.label}</span>
            {a.hint && <span className="action-hint">{a.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
