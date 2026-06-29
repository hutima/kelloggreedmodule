import { useState } from 'react';
import { GntPicker } from './left/GntPicker';

/**
 * Left panel. For now only the GNT passage picker is exposed; the raw
 * Text / Tokens / Parse / JSON editors are hidden until the tap-to-relate edit
 * mode lands (they edit the model in ways the new flow will replace).
 */
export function LeftPanel({ hidden }: { hidden: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={`panel${hidden ? ' hidden' : ''}${collapsed ? ' collapsed' : ''}`}>
      <div className="tabs">
        <button className="active">GNT</button>
        <button
          className="collapse-btn"
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand input' : 'Collapse input'}
          onClick={() => setCollapsed((v) => !v)}
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
