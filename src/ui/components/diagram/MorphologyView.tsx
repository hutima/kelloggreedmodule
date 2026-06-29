import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import { childRelations, getNode, morphCodes, grammarTone } from '@/domain/model';
import { toneColor } from '@/domain/render';
import type { KrDocument, Token } from '@/domain/schema';
import { useGloss } from './useGloss';
import { nodeHighlightColors } from '@/ui/sermon/highlights';

/**
 * MORPHOLOGY CLAUSE view (HTML) — Greek/Hebrew in surface order, grouped by
 * clause, each word stacking its form: surface (tinted by case / finite verb /
 * participle), individually-glossable morphology codes, and gloss. A thin SVG
 * overlay draws the agreement / government arcs (article↔noun, subject↔verb,
 * preposition↔object) measured from the rendered words, so they track the text
 * as it reflows. Tap a code or an arc label for its meaning.
 *
 * On-screen renderer only; SVG/PNG/print export still uses the geometric
 * `morphology` layout, so exports are unchanged.
 */

interface AgreementLink {
  a: string; // token id
  b: string; // token id
  label: string;
  glossKey: string;
}

interface Arc {
  x1: number; y1: number; cx: number; cy: number; x2: number; y2: number;
  midX: number; midY: number; label: string; glossKey: string;
}

/** Tokens grouped by their innermost enclosing clause, in surface order. */
function groupByClause(doc: KrDocument): { clauseId: string; tokens: Token[] }[] {
  const clauseOfToken = new Map<string, string>();
  const seen = new Set<string>();
  const walk = (nodeId: string, current: string) => {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    const node = getNode(doc.syntax, nodeId);
    if (!node) return;
    const cl = node.kind === 'clause' ? nodeId : current;
    for (const t of node.tokenIds) clauseOfToken.set(t, cl);
    for (const r of childRelations(doc.syntax, nodeId)) walk(r.dependentId, cl);
  };
  const root = getNode(doc.syntax, doc.syntax.rootId);
  walk(doc.syntax.rootId, root?.kind === 'clause' ? doc.syntax.rootId : '_');

  const byClause = new Map<string, Token[]>();
  for (const tok of [...doc.tokens].sort((a, b) => a.index - b.index)) {
    const cl = clauseOfToken.get(tok.id) ?? '_';
    const list = byClause.get(cl) ?? [];
    list.push(tok);
    byClause.set(cl, list);
  }
  return [...byClause.entries()]
    .sort((a, b) => Math.min(...a[1].map((t) => t.index)) - Math.min(...b[1].map((t) => t.index)))
    .map(([clauseId, tokens]) => ({ clauseId, tokens }));
}

/** Agreement / government links to draw (same data the SVG mode uses). */
function agreementLinks(doc: KrDocument): AgreementLink[] {
  const firstTok = (nodeId: string) => getNode(doc.syntax, nodeId)?.tokenIds[0];
  const predTok = (clauseId: string) => {
    const pred = childRelations(doc.syntax, clauseId).find((r) => r.type === 'predicate' || r.type === 'copula');
    return pred ? firstTok(pred.dependentId) : undefined;
  };
  const out: AgreementLink[] = [];
  const push = (a: string | undefined, b: string | undefined, label: string, glossKey: string) => {
    if (a && b && a !== b) out.push({ a, b, label, glossKey });
  };
  for (const r of doc.syntax.relations) {
    if (r.type === 'determiner' || r.type === 'adjectival') push(firstTok(r.dependentId), firstTok(r.headId), 'agr', 'agreement');
    else if (r.type === 'prepositionObject') push(firstTok(r.dependentId), firstTok(r.headId), 'of', 'prepositionObject');
    else if (r.type === 'subject') push(firstTok(r.dependentId), predTok(r.headId), 'subj', 'subject');
  }
  return out;
}

export function MorphologyView({
  hovered,
  onHover,
}: {
  hovered: Set<string>;
  onHover: (id?: string) => void;
}) {
  const doc = useEditorStore((s) => s.doc);
  const appMode = useEditorStore((s) => s.appMode);
  const setDiagramMode = useEditorStore((s) => s.setDiagramMode);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const highlights = useEditorStore((s) => s.sermon.highlights);
  const hlByNode = useMemo(() => nodeHighlightColors(highlights), [highlights]);
  const { openGloss, glossNode } = useGloss();

  const greek = doc.language === 'grc';
  const hebrew = doc.language === 'hbo';
  const groups = useMemo(() => groupByClause(doc), [doc]);
  const links = useMemo(() => agreementLinks(doc), [doc]);

  const tokenToNode = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of doc.syntax.nodes) for (const t of n.tokenIds) m.set(t, n.id);
    return m;
  }, [doc]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const rel = (tid: string) => {
      const el = container.querySelector<HTMLElement>(`[data-tid="${CSS.escape(tid)}"]`);
      if (!el) return undefined;
      const r = el.getBoundingClientRect();
      return {
        cx: r.left - cRect.left + container.scrollLeft + r.width / 2,
        bottom: r.top - cRect.top + container.scrollTop + r.height,
      };
    };
    const next: Arc[] = [];
    for (const link of links) {
      const a = rel(link.a);
      const b = rel(link.b);
      if (!a || !b) continue;
      // Only join words on the SAME row (their cards align at the same bottom).
      if (Math.abs(a.bottom - b.bottom) > 24) continue;
      const y = Math.max(a.bottom, b.bottom) + 4;
      const dip = Math.min(40, 12 + Math.abs(a.cx - b.cx) * 0.12);
      const midX = (a.cx + b.cx) / 2;
      next.push({ x1: a.cx, y1: y, cx: midX, cy: y + dip, x2: b.cx, y2: y, midX, midY: y + dip + 2, label: link.label, glossKey: link.glossKey });
    }
    setArcs(next);
    setSize({ w: container.scrollWidth, h: container.scrollHeight });
  }, [links]);

  useLayoutEffect(() => {
    measure();
  }, [measure, doc, groups]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    window.addEventListener('resize', measure);
    // Re-measure once fonts settle (Greek metrics can shift width late).
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(() => measure());
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  if (!doc.tokens.length) return <p className="empty">No words to show.</p>;

  return (
    <div className={`mc-view${greek ? ' greek' : ''}${hebrew ? ' hebrew' : ''}`} ref={containerRef}>
      {appMode === 'edit' && (
        <div className="mc-edit-hint">
          Tap a word to edit its gloss, note, or function. For sentence structure, use{' '}
          <button className="link-btn" onClick={() => setDiagramMode('dependency')}>
            Dependency
          </button>{' '}
          or{' '}
          <button className="link-btn" onClick={() => setDiagramMode('phrase-block')}>
            Phrase/Block
          </button>
          .
        </div>
      )}
      <svg className="mc-arcs" width={size.w} height={size.h} aria-hidden="true">
        {arcs.map((a, i) => (
          <g key={i}>
            <path
              d={`M ${a.x1} ${a.y1} Q ${a.cx} ${a.cy} ${a.x2} ${a.y2}`}
              fill="none"
              stroke="#8a97a3"
              strokeWidth={1.4}
              strokeDasharray="2 4"
            />
            <text
              className="mc-arc-label glossed"
              x={a.midX}
              y={a.midY + 10}
              textAnchor="middle"
              onClick={(e) => openGloss(a.glossKey, e)}
            >
              {a.label}
            </text>
          </g>
        ))}
      </svg>
      {groups.map((g, gi) => (
        <div className={`mc-clause${gi > 0 ? ' divided' : ''}`} key={g.clauseId + gi}>
          {g.tokens.map((tok) => {
            const nodeId = tokenToNode.get(tok.id);
            const tone = grammarTone(tok);
            const sel = nodeId && nodeId === selection.nodeId;
            const hot = nodeId && hovered.has(nodeId);
            const hl = nodeId ? hlByNode.get(nodeId) : undefined;
            return (
              <div
                key={tok.id}
                data-tid={tok.id}
                className={`mc-word${sel ? ' selected' : ''}${hot ? ' hovered' : ''}`}
                onClick={() => nodeId && select({ nodeId })}
                onMouseEnter={() => nodeId && onHover(nodeId)}
                onMouseLeave={() => onHover(undefined)}
              >
                <div
                  className={`mc-surface${hl ? ' highlighted' : ''}`}
                  style={{
                    ...(tone ? { color: toneColor(tone) } : {}),
                    ...(hl ? { background: hl } : {}),
                  }}
                >
                  {tok.surface}
                </div>
                <div className="mc-codes">
                  {morphCodes(tok).map((c, i) =>
                    c.glossKey ? (
                      <button
                        key={i}
                        className="mc-code glossed"
                        onClick={(e) => {
                          e.stopPropagation();
                          openGloss(c.glossKey!, e);
                        }}
                      >
                        {c.text}
                      </button>
                    ) : (
                      <span key={i} className="mc-code">
                        {c.text}
                      </span>
                    ),
                  )}
                </div>
                {tok.gloss && <div className="mc-gloss">{tok.gloss}</div>}
              </div>
            );
          })}
        </div>
      ))}
      {glossNode}
    </div>
  );
}
