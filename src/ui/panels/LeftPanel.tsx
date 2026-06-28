import { useState } from 'react';
import { TextEditor } from './left/TextEditor';
import { TokenList } from './left/TokenList';
import { JsonEditor } from './left/JsonEditor';
import { ParseEditor } from './left/ParseEditor';

type Tab = 'text' | 'tokens' | 'parse' | 'json';

const TABS: { id: Tab; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'parse', label: 'Parse' },
  { id: 'json', label: 'JSON' },
];

/** Left panel: sentence text, token list, parse (structure) editor, JSON. */
export function LeftPanel({ hidden }: { hidden: boolean }) {
  const [tab, setTab] = useState<Tab>('text');
  return (
    <aside className={`panel${hidden ? ' hidden' : ''}`}>
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
      </div>
      <div className="panel-body">
        {tab === 'text' && <TextEditor />}
        {tab === 'tokens' && <TokenList />}
        {tab === 'parse' && <ParseEditor />}
        {tab === 'json' && <JsonEditor />}
      </div>
    </aside>
  );
}
