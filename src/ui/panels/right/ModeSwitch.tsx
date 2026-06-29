import { useEditorStore } from '@/state';
import type { WorkMode } from '@/state/types';

/**
 * The working-mode switch (re-exposed): how the diagram is built.
 *  - Parsed   — show a complete, gold-standard parse (the Bible passages).
 *  - Assisted — let the inference engine propose structure to accept/reject.
 *  - Manual   — build/edit by hand.
 * Switching to Assisted runs the inference engine (handled by the store).
 */
const MODES: { id: WorkMode; label: string; title: string }[] = [
  { id: 'parsed', label: 'Parsed', title: 'Show a complete parse' },
  { id: 'assisted', label: 'Assisted', title: 'Suggest structure with the inference engine' },
  { id: 'manual', label: 'Manual', title: 'Build and edit by hand' },
];

export function ModeSwitch() {
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  return (
    <div className="version-picker mode-switch" role="group" aria-label="Working mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={mode === m.id ? 'active' : ''}
          title={m.title}
          onClick={() => setMode(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
