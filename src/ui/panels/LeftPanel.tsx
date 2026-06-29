import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import { GntPicker } from './left/GntPicker';
import { OtPicker } from './left/OtPicker';

/**
 * Left panel: the passage pickers for the two gold-standard corpora — the Greek
 * New Testament and the Hebrew Bible (Old Testament) — on switchable tabs. The
 * raw Text / Tokens / Parse / JSON editors stay hidden until the tap-to-relate
 * edit mode lands (they edit the model in ways the new flow will replace).
 */
export function LeftPanel({ hidden = false }: { hidden?: boolean }) {
  // Collapsed state lives in the store so opening a passage can auto-collapse it
  // on a narrow screen (freeing space for the text + diagram).
  const collapsed = useEditorStore((s) => s.leftCollapsed);
  const setCollapsed = useEditorStore((s) => s.setLeftCollapsed);
  const docId = useEditorStore((s) => s.doc.id);
  const docLang = useEditorStore((s) => s.doc.language);
  const [source, setSource] = useState<'gnt' | 'ot'>(docLang === 'hbo' ? 'ot' : 'gnt');

  // Follow the OPEN document's corpus so a reload (which restores the passage
  // asynchronously, after this panel has mounted on the placeholder doc) lands on
  // the right tab — e.g. an open Hebrew passage shows the OT tab, not the GNT
  // default. Manually switching tabs to browse the other corpus is unaffected,
  // since that doesn't change the open document.
  const lastSyncedDocId = useRef(docId);
  useEffect(() => {
    if (docId === lastSyncedDocId.current) return;
    lastSyncedDocId.current = docId;
    if (docLang === 'hbo') setSource('ot');
    else if (docLang === 'grc') setSource('gnt');
    // 'en' (custom) leaves the current tab as-is.
  }, [docId, docLang]);

  return (
    <aside className={`panel left${hidden ? ' hidden' : ''}${collapsed ? ' collapsed' : ''}`}>
      <div className="tabs">
        {!collapsed && (
          <>
            {/* Bible order: Old Testament first, then the Greek New Testament. */}
            <button
              className={source === 'ot' ? 'active' : ''}
              title="Hebrew Bible (Old Testament)"
              onClick={() => setSource('ot')}
            >
              OT
            </button>
            <button
              className={source === 'ot' ? '' : 'active'}
              title="Greek New Testament"
              onClick={() => setSource('gnt')}
            >
              GNT
            </button>
          </>
        )}
        <button
          className="collapse-btn"
          aria-expanded={!collapsed}
          title={collapsed ? 'Show passages' : 'Hide passages'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>
      <div className="panel-body">{source === 'ot' ? <OtPicker /> : <GntPicker />}</div>
    </aside>
  );
}
