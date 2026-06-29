import { useState } from 'react';
import { useEditorStore } from '@/state';
import { EDITING_ENABLED } from '@/ui/features';
import { Inspector } from './right/Inspector';
import { RelationshipList } from './right/RelationshipList';
import { NotesEditor } from './right/NotesEditor';
import { InferencePanel } from './right/InferencePanel';
import { ModeSwitch } from './right/ModeSwitch';

type Tab = 'edit' | 'relationships' | 'inferences' | 'notes';

/**
 * Right panel. When EDITING is enabled a working-mode switch (Parsed / Assisted /
 * Manual) sits on top and the Inspector ("Edit") edits the current selection
 * (tap-to-edit / tap-to-relate, add/delete words); in Assisted mode an
 * Inferences tab appears. With editing OFF (current default — the format is
 * being reworked) the panel is a reader: Relations lists every connection and
 * Notes holds free-text per passage. See {@link EDITING_ENABLED}.
 */
export function RightPanel({ hidden = false }: { hidden?: boolean }) {
  const mode = useEditorStore((s) => s.mode);
  const editing = EDITING_ENABLED;
  const [tab, setTab] = useState<Tab>(editing ? 'edit' : 'relationships');
  // On phones the panel starts collapsed so the diagram is visible first; it can
  // be expanded with the caret in its tab bar.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches,
  );

  const tabs: { id: Tab; label: string }[] = [
    ...(editing ? [{ id: 'edit' as const, label: 'Edit' }] : []),
    { id: 'relationships', label: 'Relations' },
    ...(editing && mode === 'assisted' ? [{ id: 'inferences' as const, label: 'Inferences' }] : []),
    { id: 'notes', label: 'Notes' },
  ];
  // Fall back to the first available tab if the current one disappears.
  const activeTab: Tab = tabs.some((t) => t.id === tab) ? tab : tabs[0]!.id;

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
      {editing && !collapsed && (
        <div className="mode-switch-bar">
          <ModeSwitch />
        </div>
      )}
      <div className="panel-body">
        {activeTab === 'edit' && editing && <Inspector />}
        {activeTab === 'relationships' && <RelationshipList />}
        {activeTab === 'inferences' && editing && <InferencePanel />}
        {activeTab === 'notes' && <NotesEditor />}
      </div>
    </aside>
  );
}
