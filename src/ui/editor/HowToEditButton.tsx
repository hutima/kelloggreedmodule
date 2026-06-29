import { useState } from 'react';
import { EditHelpModal } from './EditHelpModal';

/** The "How to edit" affordance — opens the mode/tier-aware help modal. */
export function HowToEditButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn how-to-edit"
        title="How to edit in this mode"
        onClick={() => setOpen(true)}
      >
        {compact ? '?' : 'How to edit'}
      </button>
      {open && <EditHelpModal onClose={() => setOpen(false)} />}
    </>
  );
}
