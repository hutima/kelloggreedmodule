import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import { GntPicker } from './left/GntPicker';
import { OtPicker } from './left/OtPicker';
import { NewSourcePicker } from './left/NewSourcePicker';
import { SearchPicker } from './left/SearchPicker';
import { DiscourseRangeSelector } from '@/ui/discourse/DiscourseRangeSelector';
import { DiscoursePlaintextPicker } from '@/ui/discourse/DiscoursePlaintextPicker';

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
  // The "New" (type-your-own) source is an editing tool, so it appears in Edit
  // mode (desktop-only) — and stays available in ANY mode once the user has saved
  // at least one custom parse, so saved sentences remain reachable like passages.
  // Leaving Edit with nothing saved drops the tab and falls back to GNT, so the
  // panel never strands the user on a hidden tab.
  const appMode = useEditorStore((s) => s.appMode);
  const hasSavedCustom = useEditorStore((s) => s.customParses.length > 0);
  const searchPrefill = useEditorStore((s) => s.searchPrefill);
  const showNew = appMode === 'edit' || hasSavedCustom;
  // Discourse mode swaps the syntax passage pickers for the dedicated RANGE
  // selector (its own loader, its own store). The syntax pickers — and the
  // syntax selection behind them — return untouched when the user leaves
  // Discourse mode; nothing is reloaded by the swap.
  const discourseMode = useEditorStore((s) => s.diagramMode === 'discourse');
  const [source, setSource] = useState<'gnt' | 'ot' | 'new' | 'search'>(docLang === 'hbo' ? 'ot' : 'gnt');
  // The syntax "New" tab depends on Edit mode / saved parses; the DISCOURSE
  // "New text" tab is always available in Discourse mode, so don't bounce it.
  useEffect(() => {
    if (!discourseMode && !showNew && source === 'new') setSource('gnt');
  }, [discourseMode, showNew, source]);
  // A search queued from the inspector (a word's Strong's / lemma) opens the
  // Search tab; the SearchPicker then consumes and clears the prefill.
  useEffect(() => {
    if (searchPrefill) {
      setCollapsed(false);
      setSource('search');
    }
  }, [searchPrefill, setCollapsed]);

  // Follow the OPEN document's corpus so a reload (which restores the passage
  // asynchronously, after this panel has mounted on the placeholder doc) lands on
  // the right tab — e.g. an open Hebrew passage shows the OT tab, not the GNT
  // default. Manually switching tabs to browse the other corpus is unaffected,
  // since that doesn't change the open document.
  const lastSyncedDocId = useRef(docId);
  useEffect(() => {
    if (docId === lastSyncedDocId.current) return;
    lastSyncedDocId.current = docId;
    // Keep the Search tab sticky: opening a search result changes the open doc,
    // and we don't want that to bounce the user off their results list.
    setSource((cur) => {
      if (cur === 'search') return cur;
      if (docLang === 'hbo') return 'ot';
      if (docLang === 'grc') return 'gnt';
      return cur; // 'en' (custom) leaves the current tab as-is.
    });
  }, [docId, docLang]);

  return (
    <aside className={`panel left${hidden ? ' hidden' : ''}${collapsed ? ' collapsed' : ''}`}>
      <div className="tabs">
        {!collapsed && discourseMode && (
          <>
            <button
              className={source !== 'search' && source !== 'new' ? 'active' : ''}
              title="Discourse range — load a multi-verse / chapter / whole-book range"
              onClick={() => setSource('gnt')}
            >
              Range
            </button>
            <button
              className={source === 'new' ? 'active' : ''}
              title="New text — paste plaintext to analyse (no AI parse)"
              onClick={() => setSource('new')}
            >
              New text
            </button>
            <button
              className={source === 'search' ? 'active' : ''}
              title="Search a book by word or morphology (verb parse, case…)"
              onClick={() => setSource('search')}
            >
              Search
            </button>
          </>
        )}
        {!collapsed && !discourseMode && (
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
              className={source === 'gnt' ? 'active' : ''}
              title="Greek New Testament"
              onClick={() => setSource('gnt')}
            >
              GNT
            </button>
            <button
              className={source === 'search' ? 'active' : ''}
              title="Search a book by word or morphology (verb parse, case…)"
              onClick={() => setSource('search')}
            >
              Search
            </button>
            {showNew && (
              <button
                className={source === 'new' ? 'active' : ''}
                title="New — type your own sentence to diagram (Edit mode)"
                onClick={() => setSource('new')}
              >
                New
              </button>
            )}
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
      <div className="panel-body">
        {discourseMode && source === 'new' ? (
          <DiscoursePlaintextPicker />
        ) : discourseMode && source !== 'search' ? (
          <DiscourseRangeSelector />
        ) : source === 'ot' ? (
          <OtPicker />
        ) : source === 'search' ? (
          <SearchPicker />
        ) : source === 'new' && showNew ? (
          <NewSourcePicker />
        ) : (
          <GntPicker />
        )}
      </div>
    </aside>
  );
}
