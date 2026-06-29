import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import { layoutDocument } from '@/domain/layout';
import { dashFor } from '@/domain/render';
import { describeFunction, getNode, childRelations } from '@/domain/model';
import type { KrDocument } from '@/domain/schema';

const TENTATIVE = '#c2410c';
const INK = '#1f2933';
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;

interface View {
  x: number;
  y: number;
  scale: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Interactive SVG canvas. It renders exactly the primitives the layout engine
 * emits and adds selection, click-to-relink, and a freely pan/zoomable view: the
 * diagram sits in a white field that auto-fits on load, pans by dragging, and
 * zooms on the wheel / pinch. (Export uses the same layout, so paper matches.)
 */
export function DiagramCanvas() {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const linking = useEditorStore((s) => s.linking);
  const relinkTo = useEditorStore((s) => s.relinkTo);
  const cancelRelink = useEditorStore((s) => s.cancelRelink);
  const verticalScale = useEditorStore((s) => s.verticalScale);
  const setVerticalScale = useEditorStore((s) => s.setVerticalScale);
  const [collapsed, setCollapsed] = useState(false);
  // The node currently hovered — in the diagram OR the source text — so the two
  // stay in sync (hover a word above, its diagram word lights up, and vice versa).
  const [hoverNode, setHoverNode] = useState<string | undefined>();

  const layout = useMemo(
    () => layoutDocument(doc, doc.layoutHints, { verticalScale }),
    [doc, verticalScale],
  );

  // The running source text as interactive words: each maps to the syntax node it
  // belongs to, grouped by verse (a passage stacks several verses).
  const sourceItems = useMemo(() => buildSourceItems(doc), [doc]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });

  // ---- pan / zoom --------------------------------------------------------
  /** Fit the whole diagram into the viewport (centred horizontally, top-aligned
   *  so a tall passage starts at the top and you scroll down into it). */
  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || layout.width <= 0) return;
    const pad = 24;
    const w = vp.clientWidth - pad * 2;
    const h = vp.clientHeight - pad * 2;
    const scale = clamp(Math.min(w / layout.width, h / layout.height, 1.5), MIN_SCALE, MAX_SCALE);
    const x = Math.max(pad, (vp.clientWidth - layout.width * scale) / 2);
    setView({ x, y: pad, scale });
  }, [layout.width, layout.height]);

  // Re-fit when a new document is opened or the viewport first sizes up.
  useLayoutEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(vp);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomBy = useCallback((factor: number, cx?: number, cy?: number) => {
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = scale / v.scale;
      const px = cx ?? (viewportRef.current?.clientWidth ?? 0) / 2;
      const py = cy ?? (viewportRef.current?.clientHeight ?? 0) / 2;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  // Wheel zoom toward the cursor. Attached non-passively so preventDefault stops
  // the page (or trackpad) from scrolling underneath the gesture.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  // Pointer gestures: one pointer pans, two pinch-zoom. A small move threshold
  // distinguishes a pan from a tap so word selection still works.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const moved = useRef(false);

  const centroid = () => {
    const pts = [...pointers.current.values()];
    return {
      cx: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      cy: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // NB: do NOT setPointerCapture — capturing retargets the subsequent click to
    // the viewport, which would swallow word/line selection. Panning within the
    // viewport works fine without it.
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    pinch.current = null;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const { cx, cy } = centroid();
      const rect = viewportRef.current!.getBoundingClientRect();
      if (pinch.current) {
        zoomBy(dist / pinch.current.dist, cx - rect.left, cy - rect.top);
        setView((v) => ({ ...v, x: v.x + (cx - pinch.current!.cx), y: v.y + (cy - pinch.current!.cy) }));
      }
      pinch.current = { dist, cx, cy };
      moved.current = true;
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  // ---- selection / relink ------------------------------------------------
  useEffect(() => {
    if (!linking) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelRelink();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linking, cancelRelink]);

  const onNode = (nodeId?: string) => {
    if (moved.current) return; // a drag, not a tap
    if (!nodeId) return select({});
    if (linking) relinkTo(nodeId);
    else select({ nodeId });
  };

  const isSelected = (nodeId?: string, relationId?: string) =>
    (nodeId && nodeId === selection.nodeId) || (relationId && relationId === selection.relationId);

  // ---- reveal popover (clamped into the viewport) ------------------------
  const reveal = useMemo(() => {
    if (linking || !selection.nodeId) return null;
    const anchor = layout.elements.find(
      (e) => e.kind === 'text' && e.nodeId === selection.nodeId && !e.rotate,
    ) as { x: number; y: number } | undefined;
    const summary = describeFunction(doc, selection.nodeId);
    if (!anchor || !summary) return null;
    return { anchor, summary };
  }, [doc, layout, selection.nodeId, linking]);

  const revealPos = useMemo(() => {
    if (!reveal) return null;
    const vp = viewportRef.current;
    const W = vp?.clientWidth ?? 600;
    const H = vp?.clientHeight ?? 400;
    const POP_W = 240;
    const POP_H = 130;
    const px = view.x + reveal.anchor.x * view.scale;
    const py = view.y + reveal.anchor.y * view.scale + 14; // just below the word
    return {
      left: clamp(px - POP_W / 2, 8, Math.max(8, W - POP_W - 8)),
      top: clamp(py, 8, Math.max(8, H - POP_H - 8)),
    };
  }, [reveal, view]);

  return (
    <div className={`canvas${collapsed ? ' collapsed' : ''}`}>
      <div className="panel-head">
        <span className="panel-head-title">Diagram</span>
        <div className="canvas-tools">
          <div className="canvas-zoom" title="Row spacing">
            <button title="Tighter rows" onClick={() => setVerticalScale(Math.round((verticalScale - 0.15) * 100) / 100)}>↕−</button>
            <button title="Reset rows" onClick={() => setVerticalScale(1)}>{Math.round(verticalScale * 100)}%</button>
            <button title="Looser rows" onClick={() => setVerticalScale(Math.round((verticalScale + 0.15) * 100) / 100)}>↕+</button>
          </div>
          <div className="canvas-zoom">
            <button title="Zoom out" onClick={() => zoomBy(1 / 1.2)}>−</button>
            <button title="Fit to view" onClick={fit}>⤢</button>
            <button title="Zoom in" onClick={() => zoomBy(1.2)}>+</button>
          </div>
        </div>
        <button
          className="collapse-btn"
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand diagram' : 'Collapse diagram'}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>
      {linking && (
        <div className="relink-banner">
          Click the word to use as the new <strong>{linking.end}</strong>.
          <button className="mini" onClick={cancelRelink}>Cancel (Esc)</button>
        </div>
      )}
      {sourceItems.length > 0 && (
        <div className={`source-text${doc.language === 'grc' ? ' greek' : ''}`} title="Source text">
          {sourceItems.map((it, i) =>
            it.kind === 'verse' ? (
              <span key={`v${i}`} className="src-verse">
                {it.label}
              </span>
            ) : (
              <span
                key={it.tid}
                className={`src-word${it.nodeId && it.nodeId === selection.nodeId ? ' selected' : ''}${
                  it.nodeId && it.nodeId === hoverNode ? ' hovered' : ''
                }`}
                onMouseEnter={() => it.nodeId && setHoverNode(it.nodeId)}
                onMouseLeave={() => setHoverNode(undefined)}
                onClick={() => it.nodeId && !linking && select({ nodeId: it.nodeId })}
              >
                {it.surface}{' '}
              </span>
            ),
          )}
        </div>
      )}
      <div
        className={`canvas-viewport${linking ? ' relinking' : ''}`}
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          if (e.target === e.currentTarget && !moved.current) {
            if (linking) cancelRelink();
            else select({});
          }
        }}
      >
        <div
          className="diagram-pan"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <svg
            className="diagram-paper"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label={`Kellogg-Reed diagram of: ${doc.text || doc.title}`}
          >
            {layout.elements.map((el) => {
              if (el.kind === 'line') {
                const sel = isSelected(el.nodeId, el.relationId);
                const dash = dashFor(el.style);
                return (
                  <g key={el.id}>
                    <line
                      className={`kr-line${sel ? ' selected' : ''}`}
                      x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                      stroke={el.tentative ? TENTATIVE : INK}
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      {...(dash ? { strokeDasharray: dash } : {})}
                    />
                    {(el.nodeId || el.relationId) && (
                      <line
                        className="kr-hit"
                        x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                        onClick={() => {
                          if (moved.current) return;
                          if (el.nodeId) onNode(el.nodeId);
                          else if (el.relationId && !linking) select({ relationId: el.relationId });
                        }}
                      />
                    )}
                  </g>
                );
              }
              const sel = isSelected(el.nodeId, el.relationId);
              const hov = el.nodeId && el.nodeId === hoverNode;
              return (
                <text
                  key={el.id}
                  className={`kr-text${sel ? ' selected' : ''}${hov ? ' hovered' : ''}`}
                  x={el.x} y={el.y}
                  textAnchor={el.anchor}
                  fontSize={el.small ? 13 : 18}
                  fontStyle={el.italic ? 'italic' : undefined}
                  fill={el.tentative ? TENTATIVE : el.muted ? '#8a97a3' : '#1f2933'}
                  {...(el.rotate ? { transform: `rotate(${el.rotate} ${el.x} ${el.y})` } : {})}
                  onMouseEnter={() => el.nodeId && setHoverNode(el.nodeId)}
                  onMouseLeave={() => el.nodeId && setHoverNode(undefined)}
                  onClick={() => {
                    if (moved.current) return;
                    if (el.nodeId) onNode(el.nodeId);
                    else if (el.relationId && !linking) select({ relationId: el.relationId });
                    else if (!linking) select({});
                  }}
                >
                  {el.text}
                </text>
              );
            })}
          </svg>
        </div>
        {reveal && revealPos && (
          <div className="kr-reveal" style={{ left: revealPos.left, top: revealPos.top }} role="status">
            <div className="kr-reveal-word">
              {reveal.summary.word}
              {reveal.summary.gloss && <span className="kr-reveal-gloss"> · {reveal.summary.gloss}</span>}
            </div>
            <div className="kr-reveal-role">{reveal.summary.role}</div>
            <div className="kr-reveal-detail">{reveal.summary.detail}</div>
            {reveal.summary.grammar && <div className="kr-reveal-grammar">{reveal.summary.grammar}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

type SourceItem =
  | { kind: 'verse'; label: string }
  | { kind: 'word'; tid: string; nodeId?: string; surface: string };

/** "Romans 5:1" → "5:1". */
function verseOf(title: string): string {
  const m = title.match(/(\d+:\d+(?:[–-]\d+)?)\s*$/);
  return m ? m[1]! : '';
}

/**
 * Flatten a document's tokens into an ordered list of verse labels + word spans,
 * each word carrying the syntax node it belongs to so the source text and the
 * diagram can highlight in lock-step.
 */
function buildSourceItems(doc: KrDocument): SourceItem[] {
  const tokenToNode = new Map<string, string>();
  for (const n of doc.syntax.nodes) for (const t of n.tokenIds) tokenToNode.set(t, n.id);

  // Map each token to the verse of the sentence that contains it.
  const tokenToVerse = new Map<string, string>();
  const root = getNode(doc.syntax, doc.syntax.rootId);
  const sentenceRoots =
    root?.clauseType === 'discourse'
      ? childRelations(doc.syntax, root.id).map((r) => getNode(doc.syntax, r.dependentId))
      : [root];
  for (const s of sentenceRoots) {
    if (!s) continue;
    const label = s.label || verseOf(doc.title);
    const seen = new Set<string>();
    const stack = [s.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = getNode(doc.syntax, id);
      node?.tokenIds.forEach((t) => tokenToVerse.set(t, label));
      for (const r of childRelations(doc.syntax, id)) stack.push(r.dependentId);
    }
  }

  const items: SourceItem[] = [];
  let lastVerse: string | undefined;
  for (const t of doc.tokens) {
    const v = tokenToVerse.get(t.id) ?? '';
    if (v && v !== lastVerse) items.push({ kind: 'verse', label: v });
    lastVerse = v;
    items.push({ kind: 'word', tid: t.id, nodeId: tokenToNode.get(t.id), surface: t.surface });
  }
  return items;
}
