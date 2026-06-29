import { useEditorStore } from '@/state';
import type { EditorAction } from './types';

/**
 * BASIC-tier contextual editor — a compact popover/toolbar for the current
 * selection. Plain-English chips (relabel in one tap) sit on top; the remaining
 * actions are buttons. An always-present "Advanced" button hands off to the full
 * action sheet for precise edits. This is what makes Basic Edit feel direct: tap
 * a word or line, get a small menu, no modals.
 */
export function InlineSyntaxPopover({
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
  const setEditTier = useEditorStore((s) => s.setEditTier);
  if (!actions.length) return null;

  const chips = actions.filter((a) => a.chip);
  const rows = actions.filter((a) => !a.chip);

  return (
    <div className="inline-popover" role="dialog" aria-label="Quick edit">
      <div className="inline-popover-head">
        <span className="inline-popover-title">{title ?? 'Edit'}</span>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {chips.length > 0 && (
        <div className="inline-popover-chips" role="group" aria-label="Quick labels">
          {chips.map((a) => (
            <button key={a.id} className="chip" title={a.hint} onClick={() => onAction(a)}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      <div className="inline-popover-rows">
        {rows.map((a) => (
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

      <div className="inline-popover-foot">
        <button className="link-btn" onClick={() => setEditTier('advanced')}>
          Advanced…
        </button>
      </div>
    </div>
  );
}
