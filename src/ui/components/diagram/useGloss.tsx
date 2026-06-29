import { useCallback, useEffect, useState } from 'react';
import { lookupGloss } from '@/domain/model';

/**
 * A small glossary popover shared by the HTML diagram views (Phrase/Block,
 * Morphology). Tapping a glossable code/label opens a fixed-position card with
 * its meaning; tapping elsewhere or pressing Esc closes it. Reuses the dark
 * detail-card styling (`.kr-reveal.kr-gloss`).
 */
export function useGloss() {
  const [state, setState] = useState<{ key: string; x: number; y: number } | null>(null);

  const openGloss = useCallback((key: string, e: { clientX: number; clientY: number }) => {
    if (!lookupGloss(key)) return;
    setState({ key, x: e.clientX, y: e.clientY });
  }, []);
  const closeGloss = useCallback(() => setState(null), []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setState(null);
    const onDown = () => setState(null);
    window.addEventListener('keydown', onKey);
    // Close on the NEXT pointerdown anywhere (the opening click already fired).
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [state]);

  const entry = state ? lookupGloss(state.key) : undefined;
  const POP_W = 250;
  const glossNode =
    state && entry ? (
      <div
        className="kr-reveal kr-gloss kr-gloss-fixed"
        style={{
          position: 'fixed',
          left: Math.max(8, Math.min(state.x - POP_W / 2, (typeof window !== 'undefined' ? window.innerWidth : 800) - POP_W - 8)),
          top: state.y + 14,
        }}
        role="status"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button className="kr-reveal-close" title="Close (Esc)" aria-label="Close" onClick={closeGloss}>
          ✕
        </button>
        <div className="kr-reveal-word">
          {entry.term}
          {entry.abbr && <span className="kr-reveal-gloss"> · {entry.abbr}</span>}
        </div>
        <div className="kr-reveal-detail">{entry.detail}</div>
      </div>
    ) : null;

  return { openGloss, closeGloss, glossNode };
}
