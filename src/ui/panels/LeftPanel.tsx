import { useEditorStore } from '@/state';
import { GntPicker } from './left/GntPicker';

/**
 * Left panel. For now only the GNT passage picker is exposed; the raw
 * Text / Tokens / Parse / JSON editors are hidden until the tap-to-relate edit
 * mode lands (they edit the model in ways the new flow will replace).
 */
export function LeftPanel({ hidden = false }: { hidden?: boolean }) {
  // Collapsed state lives in the store so opening a passage can auto-collapse it
  // on a narrow screen (freeing space for the text + diagram).
  const collapsed = useEditorStore((s) => s.leftCollapsed);
  const setCollapsed = useEditorStore((s) => s.setLeftCollapsed);
  return (
    <aside className={`panel left${hidden ? ' hidden' : ''}${collapsed ? ' collapsed' : ''}`}>
      <div className="tabs">
        {!collapsed && <button className="active">GNT</button>}
        <button
          className="collapse-btn"
          aria-expanded={!collapsed}
          title={collapsed ? 'Show passages' : 'Hide passages'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>
      <div className="panel-body">
        <GntPicker />
      </div>
    </aside>
  );
}
