import { useState } from 'react';
import { RelationshipList } from './right/RelationshipList';
import { NotesEditor } from './right/NotesEditor';

type Tab = 'relationships' | 'notes';

/**
 * Right panel. For now only Relations and Notes are exposed; the Inspector,
 * Layout-hints, and Inference tabs are hidden until the tap-to-relate edit mode
 * lands (selecting a word still shows its parse in the diagram popover).
 */
export function RightPanel({ hidden = false }: { hidden?: boolean }) {
  const [tab, setTab] = useState<Tab>('relationships');
  // On phones the panel starts collapsed so the diagram is visible first; it can
  // be expanded with the caret in its tab bar.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches,
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'relationships', label: 'Relations' },
    { id: 'notes', label: 'Notes' },
  ];

  return (
    <aside className={`panel right${hidden ? ' hidden' : ''}${collapsed ? ' collapsed' : ''}`}>
      <div className="tabs">
        {!collapsed &&
          tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        <button
          className="collapse-btn"
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>
      <div className="panel-body">
        {tab === 'relationships' && <RelationshipList />}
        {tab === 'notes' && <NotesEditor />}
      </div>
    </aside>
  );
}
