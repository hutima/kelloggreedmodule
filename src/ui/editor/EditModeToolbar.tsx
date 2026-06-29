import { useEditorStore, selectCanUndo, selectCanRedo } from '@/state';
import type { BasicEditTool } from '@/state/types';
import { DIAGRAM_MODES } from '@/domain/layout';
import { adapterFor } from './adapters';
import { EditTierToggle } from './EditTierToggle';
import { HowToEditButton } from './HowToEditButton';

/**
 * Edit-mode control strip. It does NOT replace the TopBar — it's the edit-only
 * band mounted inside the diagram canvas while `appMode === 'edit'`. It shows the
 * current diagram mode, the Basic/Advanced toggle, the active Basic-Edit tool,
 * the How-to-edit help, and undo/redo. Which tools appear depends on the mode
 * (visual linking for Dependency/Kellogg-Reed; move/group for Phrase/Block).
 */

const TOOL_META: Record<BasicEditTool, { label: string; icon: string; hint: string }> = {
  select: { label: 'Select', icon: '➤', hint: 'Select and edit (tap a word or line)' },
  link: { label: 'Link', icon: '↬', hint: 'Draw a relationship: tap the dependent, then its head' },
  move: { label: 'Move', icon: '⇳', hint: 'Reparent: select a block, then tap its new parent' },
  group: { label: 'Group', icon: '⊞', hint: 'Merge selected words into one phrase' },
  delete: { label: 'Delete', icon: '🗑', hint: 'Remove the next relationship you tap' },
};

export function EditModeToolbar() {
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const editTier = useEditorStore((s) => s.editTier);
  const activeEditTool = useEditorStore((s) => s.activeEditTool);
  const setActiveEditTool = useEditorStore((s) => s.setActiveEditTool);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  // "Clean up" re-flows the Kellogg-Reed diagram from the parse by clearing all
  // manual placement hints — the main lever for clearing clashes after edits.
  const cleanLayout = useEditorStore((s) => s.cleanLayout);
  const hasLayoutHints = useEditorStore((s) => Object.keys(s.doc.layoutHints).length > 0);

  const adapter = adapterFor(diagramMode);
  const modeLabel = DIAGRAM_MODES.find((m) => m.id === diagramMode)?.label ?? adapter.label;
  // Always offer Select; append the mode's extra Basic tools.
  const tools: BasicEditTool[] = ['select', ...(adapter.basicInteraction?.tools ?? [])];

  return (
    <div className="edit-toolbar" role="toolbar" aria-label="Edit tools">
      <span className="edit-toolbar-mode" title="Current diagram mode">
        {modeLabel}
      </span>

      <EditTierToggle />

      {editTier === 'basic' ? (
        <div className="tool-group" role="group" aria-label="Tool">
          {tools.map((t) => (
            <button
              key={t}
              type="button"
              className={`tool-btn${activeEditTool === t ? ' active' : ''}`}
              aria-pressed={activeEditTool === t}
              title={TOOL_META[t].hint}
              onClick={() => setActiveEditTool(t)}
            >
              <span className="tool-icon" aria-hidden="true">
                {TOOL_META[t].icon}
              </span>
              <span className="tool-label">{TOOL_META[t].label}</span>
            </button>
          ))}
        </div>
      ) : (
        <span className="edit-toolbar-tool" title="Advanced editing uses modals and full lists">
          Advanced editing
        </span>
      )}

      <div className="spacer" />

      {diagramMode === 'kellogg-reed' && (
        <button
          type="button"
          className="tool-btn clean-btn"
          disabled={!hasLayoutHints}
          title={
            hasLayoutHints
              ? 'Clean up: re-flow the diagram from the parse to clear placement clashes'
              : 'Nothing to clean — the diagram already follows the parse'
          }
          onClick={cleanLayout}
        >
          <span className="tool-icon" aria-hidden="true">
            ✦
          </span>
          <span className="tool-label">Clean up</span>
        </button>
      )}

      <div className="tool-group" role="group" aria-label="History">
        <button type="button" className="tool-btn" disabled={!canUndo} title="Undo" onClick={undo}>
          ↶
        </button>
        <button type="button" className="tool-btn" disabled={!canRedo} title="Redo" onClick={redo}>
          ↷
        </button>
      </div>

      <HowToEditButton />
    </div>
  );
}
