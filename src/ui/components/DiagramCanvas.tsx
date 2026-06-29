import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '@/state';
import { layoutForMode, DIAGRAM_MODES } from '@/domain/layout';
import { dashFor } from '@/domain/render';
import { describeFunction, getNode, childRelations } from '@/domain/model';
import { loadParallelBook, alignParallel, bookForDoc, type ParallelBook, type ParallelView } from '@/io';
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
  const diagramMode = useEditorStore((s) => s.diagramMode);
  const setDiagramMode = useEditorStore((s) => s.setDiagramMode);
  const gntPassages = useEditorStore((s) => s.gntPassages);
  const gntIndex = useEditorStore((s) => s.gntIndex);
  const stepGnt = useEditorStore((s) => s.stepGnt);
  const [collapsed, setCollapsed] = useState(false);
  // What is currently hovered — in the diagram, the Greek strip, or the English
  // strip — kept as the set of diagram nodes AND English words it touches, so all
  // three views light up in lock-step (a Greek word ↔ its English translation).
  const [hover, setHover] = useState<{ nodes: Set<string>; en: Set<string> }>(() => ({
    nodes: new Set(),
    en: new Set(),
  }));

  // Parallel English text (Berean Standard Bible), loaded per book on demand, and
  // which version the source strip shows. Only offered for Greek passages.
  const [parallelBook, setParallelBook] = useState<ParallelBook | null>(null);
  const [version, setVersion] = useState<'grc' | 'en'>('grc');
  // The source/reference strip collapses out of the way to give the diagram room,
  // and its height is draggable to rebalance text vs. diagram.
  const [srcCollapsed, setSrcCollapsed] = useState(false);
  const [srcHeight, setSrcHeight] = useState(132);

  const onSrcResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = srcHeight;
      const move = (ev: PointerEvent) => setSrcHeight(clamp(startH + (ev.clientY - startY), 40, 640));
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [srcHeight],
  );

  const layout = useMemo(
    () => layoutForMode(diagramMode, doc, doc.layoutHints, { verticalScale }),
    [diagramMode, doc, verticalScale],
  );

  // The running source text as interactive words: each maps to the syntax node it
  // belongs to, grouped by verse (a passage stacks several verses).
  const sourceItems = useMemo(() => buildSourceItems(doc), [doc]);

  // Fetch the matching parallel book when a Greek passage is opened.
  useEffect(() => {
    setParallelBook(null);
    if (doc.language !== 'grc') return;
    const book = bookForDoc(doc);
    if (!book) return;
    let live = true;
    loadParallelBook(book).then((b) => live && setParallelBook(b));
    return () => {
      live = false;
    };
  }, [doc]);

  const parallel: ParallelView | null = useMemo(
    () => (parallelBook ? alignParallel(doc, parallelBook) : null),
    [doc, parallelBook],
  );
  const hasEnglish = (parallel?.verses.length ?? 0) > 0;
  // Fall back to Greek if English isn't available for the current passage.
  const showEnglish = version === 'en' && hasEnglish;

  // Hover helpers keep the diagram, Greek strip, and English strip in sync.
  const hoverDiagram = useCallback(
    (nodeId?: string) =>
      setHover(
        nodeId
          ? { nodes: new Set([nodeId]), en: new Set(parallel?.nodeToEn.get(nodeId) ?? []) }
          : { nodes: new Set(), en: new Set() },
      ),
    [parallel],
  );
  const hoverEnglish = useCallback(
    (key?: string) =>
      setHover(
        key
          ? { nodes: new Set(parallel?.enToNodes.get(key) ?? []), en: new Set([key]) }
          : { nodes: new Set(), en: new Set() },
      ),
    [parallel],
  );

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
    // A degenerate pinch (two touches coinciding → 0/0) can hand us a NaN/∞
    // factor; ignore it so `scale` never becomes NaN and the SVG never gets
    // width="NaN" (which renders as a blank white diagram).
    if (!Number.isFinite(factor) || factor <= 0) return;
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      if (!Number.isFinite(scale)) return v;
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
      // Only zoom once we have a valid previous separation (guards 0/0 → NaN when
      // two touches momentarily coincide).
      if (pinch.current && pinch.current.dist > 0 && dist > 0) {
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

  // Escape closes the tap-a-word detail popover.
  useEffect(() => {
    if (linking || !selection.nodeId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select({});
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linking, selection.nodeId, select]);

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
    // Prefer a horizontal text anchor, but fall back to a rotated one so small
    // diagonal words (articles, πᾶς, prepositions) still get a detail popover.
    const texts = layout.elements.filter(
      (e) => e.kind === 'text' && e.nodeId === selection.nodeId,
    ) as { x: number; y: number; rotate?: number }[];
    const anchor = texts.find((e) => !e.rotate) ?? texts[0];
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
          <label className="mode-select" title={DIAGRAM_MODES.find((m) => m.id === diagramMode)?.description}>
            <span className="sr-only">Diagram mode</span>
            <select
              aria-label="Diagram mode"
              value={diagramMode}
              onChange={(e) => setDiagramMode(e.target.value as typeof diagramMode)}
            >
              {DIAGRAM_MODES.map((m) => (
                <option key={m.id} value={m.id} title={m.description}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
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
      {(sourceItems.length > 0 || hasEnglish) && (
        <div
          className={`source-wrap${srcCollapsed ? ' collapsed' : ''}`}
          style={srcCollapsed ? undefined : { height: srcHeight }}
        >
          <div className="source-bar">
            {hasEnglish ? (
              <div className="version-picker" role="group" aria-label="Source language">
                <button
                  className={!showEnglish ? 'active' : ''}
                  onClick={() => setVersion('grc')}
                >
                  Greek
                </button>
                <button
                  className={showEnglish ? 'active' : ''}
                  onClick={() => setVersion('en')}
                >
                  English
                </button>
              </div>
            ) : (
              <span className="source-label">Source text</span>
            )}
            {gntIndex >= 0 && gntPassages.length > 0 && (
              <div className="sentence-nav" role="group" aria-label="Navigate sentences">
                <button
                  title="Previous sentence"
                  aria-label="Previous sentence"
                  disabled={gntIndex <= 0}
                  onClick={() => stepGnt(-1)}
                >
                  ◀
                </button>
                <span className="sentence-pos">
                  {gntIndex + 1}/{gntPassages.length}
                </span>
                <button
                  title="Next sentence"
                  aria-label="Next sentence"
                  disabled={gntIndex >= gntPassages.length - 1}
                  onClick={() => stepGnt(1)}
                >
                  ▶
                </button>
              </div>
            )}
            <button
              className="collapse-btn"
              aria-expanded={!srcCollapsed}
              title={srcCollapsed ? 'Show source text' : 'Hide source text'}
              onClick={() => setSrcCollapsed((v) => !v)}
            >
              {srcCollapsed ? '▸' : '▾'}
            </button>
          </div>
          {!srcCollapsed &&
            (showEnglish ? (
            <div className="source-text english" title="Berean Standard Bible (word-aligned)">
              {parallel!.verses.map((v) => (
                <Fragment key={v.key}>
                  <span className="src-verse">{v.label}</span>
                  {v.words.map((w) => {
                    const space = w.joinLeft ? '' : ' ';
                    if (w.excl)
                      return (
                        <span key={w.i} className="src-punc">
                          {space}
                          {w.t}
                        </span>
                      );
                    const key = `${v.key}#${w.i}`;
                    return (
                      <Fragment key={w.i}>
                        {space}
                        <span
                          className={`src-word${hover.en.has(key) ? ' hovered' : ''}`}
                          onMouseEnter={() => hoverEnglish(key)}
                          onMouseLeave={() => hoverEnglish(undefined)}
                          onClick={() => {
                            const ns = parallel!.enToNodes.get(key);
                            if (ns?.[0] && !linking) select({ nodeId: ns[0] });
                          }}
                        >
                          {w.t}
                        </span>
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          ) : (
            sourceItems.length > 0 && (
              <div
                className={`source-text${doc.language === 'grc' ? ' greek' : ''}${
                  doc.language === 'hbo' ? ' hebrew' : ''
                }`}
                title="Source text"
              >
                {sourceItems.map((it, i) =>
                  it.kind === 'verse' ? (
                    <span key={`v${i}`} className="src-verse">
                      {it.label}
                    </span>
                  ) : (
                    <span
                      key={it.tid}
                      className={`src-word${it.nodeId && it.nodeId === selection.nodeId ? ' selected' : ''}${
                        it.nodeId && hover.nodes.has(it.nodeId) ? ' hovered' : ''
                      }`}
                      onMouseEnter={() => it.nodeId && hoverDiagram(it.nodeId)}
                      onMouseLeave={() => hoverDiagram(undefined)}
                      onClick={() => it.nodeId && !linking && select({ nodeId: it.nodeId })}
                    >
                      {it.surface}{' '}
                    </span>
                  ),
                )}
              </div>
            )
          ))}
          {!srcCollapsed && (
            <div
              className="source-resize"
              title="Drag to resize"
              onPointerDown={onSrcResize}
            />
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
          style={{ transform: `translate(${view.x}px, ${view.y}px)` }}
        >
          {/* Zoom drives the SVG's intrinsic size (viewBox fixed) rather than a
              CSS scale() — so the vector re-renders crisply instead of the
              browser stretching a rasterised layer (which looked fuzzy). */}
          <svg
            className={`diagram-paper${doc.language === 'hbo' ? ' hebrew' : ''}`}
            width={Number.isFinite(view.scale) ? layout.width * view.scale : layout.width}
            height={Number.isFinite(view.scale) ? layout.height * view.scale : layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label={`Kellogg-Reed diagram of: ${doc.text || doc.title}`}
            onClick={(e) => {
              // A click on empty diagram space (the svg itself, not a word/line)
              // dismisses the detail popover.
              if (e.target === e.currentTarget && !moved.current && !linking) select({});
            }}
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
              if (el.kind === 'curve') {
                const sel = isSelected(el.nodeId, el.relationId);
                const dash = dashFor(el.style);
                const d = `M ${el.x1} ${el.y1} Q ${el.cx} ${el.cy} ${el.x2} ${el.y2}`;
                // Arrowhead: a small triangle at the end, aimed along the tangent.
                const ang = Math.atan2(el.y2 - el.cy, el.x2 - el.cx);
                const s = 6;
                const head = el.arrow
                  ? `M ${el.x2} ${el.y2} L ${el.x2 + s * Math.cos(ang + Math.PI - 0.4)} ${el.y2 + s * Math.sin(ang + Math.PI - 0.4)} L ${el.x2 + s * Math.cos(ang + Math.PI + 0.4)} ${el.y2 + s * Math.sin(ang + Math.PI + 0.4)} Z`
                  : '';
                const color = el.tentative ? TENTATIVE : INK;
                return (
                  <g key={el.id}>
                    <path
                      className={`kr-line${sel ? ' selected' : ''}`}
                      d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round"
                      {...(dash ? { strokeDasharray: dash } : {})}
                    />
                    {head && <path d={head} fill={color} stroke="none" />}
                    {el.relationId && (
                      <path
                        className="kr-hit" d={d} fill="none"
                        onClick={() => {
                          if (moved.current) return;
                          if (el.relationId && !linking) select({ relationId: el.relationId });
                        }}
                      />
                    )}
                  </g>
                );
              }
              const sel = isSelected(el.nodeId, el.relationId);
              const hov = el.nodeId && hover.nodes.has(el.nodeId);
              return (
                <text
                  key={el.id}
                  className={`kr-text${sel ? ' selected' : ''}${hov ? ' hovered' : ''}`}
                  x={el.x} y={el.y}
                  textAnchor={el.anchor}
                  fontSize={el.small ? 13 : 18}
                  fontStyle={el.italic ? 'italic' : undefined}
                  fill={el.tentative ? TENTATIVE : el.muted ? '#8a97a3' : '#1f2933'}
                  {...(el.rotate
                    ? { transform: `rotate(${el.rotate} ${el.x} ${el.y})` }
                    : { stroke: '#fff', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' })}
                  onMouseEnter={() => el.nodeId && hoverDiagram(el.nodeId)}
                  onMouseLeave={() => el.nodeId && hoverDiagram(undefined)}
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
            <button
              className="kr-reveal-close"
              title="Close (Esc)"
              aria-label="Close"
              onClick={() => select({})}
            >
              ✕
            </button>
            <div className="kr-reveal-word">
              {reveal.summary.word}
              {reveal.summary.gloss && <span className="kr-reveal-gloss"> · {reveal.summary.gloss}</span>}
            </div>
            {reveal.summary.translit && (
              <div className="kr-reveal-translit">{reveal.summary.translit}</div>
            )}
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
