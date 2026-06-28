import { useState } from 'react';
import { TextEditor } from './left/TextEditor';
import { TokenList } from './left/TokenList';
import { JsonEditor } from './left/JsonEditor';
import { ParseEditor } from './left/ParseEditor';
import { GntPicker } from './left/GntPicker';

type Tab = 'text' | 'tokens' | 'parse' | 'json' | 'gnt';

const TABS: { id: Tab; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'parse', label: 'Parse' },
  { id: 'json', label: 'JSON' },
  { id: 'gnt', label: 'GNT' },
];

/** Left panel: sentence text, token list, parse (structure) editor, JSON. */
export function LeftPanel({ hidden }: { hidden: boolean }) {
  const [tab, setTab] = useState<Tab>('text');
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={`panel${hidden ? ' hidden' : ''}${collapsed ? ' collapsed' : ''}`}>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
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
        {tab === 'text' && <TextEditor />}
        {tab === 'tokens' && <TokenList />}
        {tab === 'parse' && <ParseEditor />}
        {tab === 'json' && <JsonEditor />}
        {tab === 'gnt' && <GntPicker />}
      </div>
    </aside>
  );
}
