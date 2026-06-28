import { useState } from 'react';
import { useEditorStore } from '@/state';
import { Inspector } from './right/Inspector';
import { RelationshipList } from './right/RelationshipList';
import { NotesEditor } from './right/NotesEditor';
import { LayoutHintsEditor } from './right/LayoutHintsEditor';
import { InferencePanel } from './right/InferencePanel';

type Tab = 'inspector' | 'relationships' | 'notes' | 'layout' | 'inferences';

/** Right panel: inspector, relationships, notes, layout hints, and (in
 *  Assisted mode) the inference review queue. */
export function RightPanel({ hidden }: { hidden: boolean }) {
  const mode = useEditorStore((s) => s.mode);
  const inferenceCount = useEditorStore((s) => s.inferences.length);
  const [tab, setTab] = useState<Tab>('inspector');
  // On phones the inspector starts collapsed so the input and diagram are
  // visible first; it can be expanded with the caret in its tab bar.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches,
  );

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'inspector', label: 'Inspector', show: true },
    { id: 'relationships', label: 'Relations', show: true },
    { id: 'notes', label: 'Notes', show: true },
    { id: 'layout', label: 'Layout', show: true },
    {
      id: 'inferences',
      label: `Inferences${inferenceCount ? ` (${inferenceCount})` : ''}`,
      show: mode === 'assisted',
    },
  ];

  const active = tabs.find((t) => t.id === tab && t.show) ? tab : 'inspector';

  return (
    <aside className={`panel right${hidden ? ' hidden' : ''}${collapsed ? ' collapsed' : ''}`}>
      <div className="tabs">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              className={active === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        <button
          className="collapse-btn"
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand inspector' : 'Collapse inspector'}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>
      <div className="panel-body">
        {active === 'inspector' && <Inspector />}
        {active === 'relationships' && <RelationshipList />}
        {active === 'notes' && <NotesEditor />}
        {active === 'layout' && <LayoutHintsEditor />}
        {active === 'inferences' && <InferencePanel />}
      </div>
    </aside>
  );
}
