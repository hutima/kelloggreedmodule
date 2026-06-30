import { useEffect, useState } from 'react';
import { useEditorStore } from '@/state';
import { useViewport } from '@/ui/responsive';
import { EDITING_ENABLED } from '@/ui/features';
import { Inspector } from './right/Inspector';
import { RelationshipList } from './right/RelationshipList';
import { NotesEditor } from './right/NotesEditor';
import { InferencePanel } from './right/InferencePanel';
import { ModeSwitch } from './right/ModeSwitch';

type Tab = 'verses' | 'edit' | 'relationships' | 'inferences' | 'notes';

/**
 * Right panel. When EDITING is enabled a working-mode switch (Parsed / Assisted /
 * Manual) sits on top and the Inspector ("Edit") edits the current selection
 * (tap-to-edit / tap-to-relate, add/delete words); in Assisted mode an
 * Inferences tab appears. With editing OFF (current default — the format is
 * being reworked) the panel is a reader: Relations lists every connection and
 * Notes holds free-text per passage. See {@link EDITING_ENABLED}.
 *
 * On desktop the reader can dock the verses strip here (a "Verses" tab in front of
 * the others); its body is an empty host the DiagramCanvas portals the live strip
 * into, so the diagram keeps the full center height while the text reads alongside.
 */
export function RightPanel({ hidden = false }: { hidden?: boolean }) {
  const mode = useEditorStore((s) => s.mode);
  const versesInPanel = useEditorStore((s) => s.versesInPanel);
  const setVersesHost = useEditorStore((s) => s.setVersesHost);
  const vp = useViewport();
  const versesActive = versesInPanel && vp.isDesktop;
  const editing = EDITING_ENABLED;
  const [tab, setTab] = useState<Tab>(editing ? 'edit' : 'relationships');
  // On phones the panel starts collapsed so the diagram is visible first; it can
  // be expanded with the caret in its tab bar.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches,
  );

  // Docking the verses jumps to their tab so they're visible right away; undocking
  // (the tab disappears) falls back to the first remaining tab via `activeTab`.
  useEffect(() => {
    if (versesActive) setTab('verses');
  }, [versesActive]);

  const tabs: { id: Tab; label: string }[] = [
    ...(versesActive ? [{ id: 'verses' as const, label: 'Verses' }] : []),
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
      {editing && !collapsed && activeTab !== 'verses' && (
        <div className="mode-switch-bar">
          <ModeSwitch />
        </div>
      )}
      {/* The verses tab body is just a host: DiagramCanvas portals the live strip
          into it (and clears the registration when this unmounts). Kept mounted only
          while its tab is active, so the diagram reclaims the height otherwise. */}
      {activeTab === 'verses' ? (
        <div className="verses-tab-host" ref={(el) => setVersesHost(el)} />
      ) : (
        <div className="panel-body">
          {activeTab === 'edit' && editing && <Inspector />}
          {activeTab === 'relationships' && <RelationshipList />}
          {activeTab === 'inferences' && editing && <InferencePanel />}
          {activeTab === 'notes' && <NotesEditor />}
        </div>
      )}
    </aside>
  );
}
