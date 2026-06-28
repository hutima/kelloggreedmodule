import { useState } from 'react';
import { TopBar } from './components/TopBar';
import { DiagramCanvas } from './components/DiagramCanvas';
import { LeftPanel } from './panels/LeftPanel';
import { RightPanel } from './panels/RightPanel';

/**
 * Application shell: a three-panel workspace (sources · diagram · inspector)
 * beneath a command bar. Panels collapse on narrow/tablet widths.
 */
export function App() {
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);

  return (
    <div className="app">
      <TopBar
        onToggleLeft={() => setShowLeft((v) => !v)}
        onToggleRight={() => setShowRight((v) => !v)}
      />
      <div
        className={`workspace${showLeft ? '' : ' hide-left'}${
          showRight ? '' : ' hide-right'
        }`}
      >
        <LeftPanel hidden={!showLeft} />
        <main className="panel" style={{ borderRight: 'none', background: 'var(--bg)' }}>
          <DiagramCanvas />
        </main>
        <RightPanel hidden={!showRight} />
      </div>
    </div>
  );
}
