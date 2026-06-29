import { useEditorStore } from '@/state';
import { DIAGRAM_MODES } from '@/domain/layout';

/**
 * Visualization (lens) switcher. Every option is a different VIEW over the same
 * syntax graph, never a separate model. Phrase/Block is surfaced first on touch
 * devices because it is the most finger-friendly syntax lens.
 */
export function VisualizationSwitcher({ compact = false }: { compact?: boolean }) {
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const setDiagramMode = useEditorStore((s) => s.setDiagramMode);
  return (
    <label className={`viz-switcher${compact ? ' compact' : ''}`}>
      <span className="sr-only">Visualization</span>
      <select value={diagramMode} onChange={(e) => setDiagramMode(e.target.value as typeof diagramMode)}>
        {DIAGRAM_MODES.map((m) => (
          <option key={m.id} value={m.id} title={m.description}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
