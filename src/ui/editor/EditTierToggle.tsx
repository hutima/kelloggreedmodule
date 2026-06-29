import { useEditorStore } from '@/state';
import type { EditTier } from '@/state/types';

/**
 * Basic / Advanced segmented toggle. Basic is the default — visual-first and
 * sermon-prep-first; Advanced unlocks the technical, modal-rich editors.
 */
export function EditTierToggle() {
  const editTier = useEditorStore((s) => s.editTier);
  const setEditTier = useEditorStore((s) => s.setEditTier);
  const opt = (tier: EditTier, label: string, hint: string) => (
    <button
      type="button"
      className={`tier-opt${editTier === tier ? ' active' : ''}`}
      aria-pressed={editTier === tier}
      title={hint}
      onClick={() => setEditTier(tier)}
    >
      {label}
    </button>
  );
  return (
    <div className="tier-toggle" role="group" aria-label="Edit tier">
      {opt('basic', 'Basic', 'Visual, sermon-prep-first editing')}
      {opt('advanced', 'Advanced', 'Technical parsing and manual relations')}
    </div>
  );
}
