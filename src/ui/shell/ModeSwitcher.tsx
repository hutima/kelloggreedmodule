import type { AppMode } from '@/state/types';
import { useEditorStore } from '@/state';

const MODES: { id: AppMode; label: string; short: string }[] = [
  { id: 'explore', label: 'Explore', short: 'Explore' },
  { id: 'edit', label: 'Edit', short: 'Edit' },
  { id: 'sermon', label: 'Study', short: 'Study' },
];

/**
 * The three user-facing modes. Edit is desktop-first: it is hidden on small
 * screens unless the user has forced desktop mode (`canEdit`).
 */
export function ModeSwitcher({ canEdit }: { canEdit: boolean }) {
  const appMode = useEditorStore((s) => s.appMode);
  const setAppMode = useEditorStore((s) => s.setAppMode);
  const modes = MODES.filter((m) => m.id !== 'edit' || canEdit);
  return (
    <div className="mode-switcher" role="group" aria-label="App mode">
      {modes.map((m) => (
        <button
          key={m.id}
          className={appMode === m.id ? 'active' : ''}
          onClick={() => setAppMode(m.id)}
          title={m.label}
        >
          {m.short}
        </button>
      ))}
    </div>
  );
}
