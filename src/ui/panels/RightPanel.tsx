import { useState } from 'react';
import { Inspector } from './right/Inspector';
import { RelationshipList } from './right/RelationshipList';
import { NotesEditor } from './right/NotesEditor';

type Tab = 'edit' | 'relationships' | 'notes';

/**
 * Right panel. The Inspector ("Edit") edits the current selection — tap a word
 * or line in the diagram, then change its part of speech, morphology, role,
 * clause type, or relation, and re-attach connections (tap-to-relate). Relations
 * lists every connection; Notes holds free-text per passage.
 */
export function RightPanel({ hidden = false }: { hidden?: boolean }) {
  const [tab, setTab] = useState<Tab>('edit');
  // On phones the panel starts collapsed so the diagram is visible first; it can
  // be expanded with the caret in its tab bar.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches,
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'edit', label: 'Edit' },
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
        {tab === 'edit' && <Inspector />}
        {tab === 'relationships' && <RelationshipList />}
        {tab === 'notes' && <NotesEditor />}
      </div>
    </aside>
  );
}
