import { useState } from 'react';
import { useEditorStore } from '@/state';
import { Inspector } from './right/Inspector';
import { RelationshipList } from './right/RelationshipList';
import { NotesEditor } from './right/NotesEditor';
import { InferencePanel } from './right/InferencePanel';
import { ModeSwitch } from './right/ModeSwitch';

type Tab = 'edit' | 'relationships' | 'inferences' | 'notes';

/**
 * Right panel. A working-mode switch (Parsed / Assisted / Manual) sits on top.
 * The Inspector ("Edit") edits the current selection — tap a word or line in the
 * diagram, then change its part of speech, morphology, role, clause type, or
 * relation, re-attach connections (tap-to-relate), and add/delete words.
 * Relations lists every connection; in Assisted mode an Inferences tab appears
 * with the engine's suggestions; Notes holds free-text per passage.
 */
export function RightPanel({ hidden = false }: { hidden?: boolean }) {
  const mode = useEditorStore((s) => s.mode);
  const [tab, setTab] = useState<Tab>('edit');
  // On phones the panel starts collapsed so the diagram is visible first; it can
  // be expanded with the caret in its tab bar.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches,
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'edit', label: 'Edit' },
    { id: 'relationships', label: 'Relations' },
    ...(mode === 'assisted' ? [{ id: 'inferences' as const, label: 'Inferences' }] : []),
    { id: 'notes', label: 'Notes' },
  ];
  // If the Inferences tab disappears (left Assisted mode), fall back to Edit.
  const activeTab: Tab = tabs.some((t) => t.id === tab) ? tab : 'edit';

  return (
    <aside className={`panel right${hidden ? ' hidden' : ''}${collapsed ? ' collapsed' : ''}`}>
      <div className="tabs">
        {!collapsed &&
          tabs.map((t) => (
            <button
              key={t.id}
              className={activeTab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
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
      {!collapsed && (
        <div className="mode-switch-bar">
          <ModeSwitch />
        </div>
      )}
      <div className="panel-body">
        {activeTab === 'edit' && <Inspector />}
        {activeTab === 'relationships' && <RelationshipList />}
        {activeTab === 'inferences' && <InferencePanel />}
        {activeTab === 'notes' && <NotesEditor />}
      </div>
    </aside>
  );
}
