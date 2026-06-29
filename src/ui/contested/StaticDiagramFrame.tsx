import { forwardRef, useMemo, useRef } from 'react';
import type { KrDocument, AlternateDiff } from '@/domain/schema';
import { layoutForMode, type DiagramMode } from '@/domain/layout';
import { measureText, BASE_FONT, SMALL_FONT } from '@/domain/layout/measure';
import { dashFor, toneColor } from '@/domain/render';
import { highlightForElement, impactedNodeIds } from './diffHighlighting';

/**
 * A READ-ONLY diagram frame for one document and diagram mode. Used by the
 * side-by-side comparison: it renders the same geometric primitives the main
 * canvas draws (so the two frames match), but without pan/zoom, selection, or
 * editing — just the picture, plus subtle difference outlines from a diff.
 */
const INK = '#1f2933';

export const StaticDiagramFrame = forwardRef<
  HTMLDivElement,
  { doc: KrDocument; mode: DiagramMode; diff?: AlternateDiff | null; title: string; onScrollSync?: () => void }
>(function StaticDiagramFrame({ doc, mode, diff = null, title, onScrollSync }, ref) {
  const layout = useMemo(() => layoutForMode(mode, doc, doc.layoutHints), [doc, mode]);
  const greek = doc.language === 'grc';
  const hebrew = doc.language === 'hbo';

  // Words impacted by the change, resolved AGAINST THIS FRAME'S document so the
  // base frame marks the OLD attachment and the variant frame marks the NEW one —
  // making it clear in both which clause attachment is changing.
  const impactedNodes = useMemo(() => impactedNodeIds(diff, doc), [diff, doc]);

  // Drag-to-pan (grab the diagram and pull), in addition to wheel / scrollbar.
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const el = e.currentTarget;
    el.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
    el.scrollTop = drag.current.st - (e.clientY - drag.current.y);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div className="vc-frame">
      {title && <div className="vc-frame-head">{title}</div>}
      <div
        className="vc-frame-scroll"
        ref={ref}
        onScroll={onScrollSync}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <svg
          className={`diagram-paper${hebrew ? ' hebrew' : ''}`}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-label={`${title}: ${doc.text || doc.title}`}
        >
          {layout.elements.map((el) => {
            const hi = highlightForElement(el, diff);
            const hiClass = hi ? ` vc-hi vc-hi-${hi}` : '';
            if (el.kind === 'line') {
              const dash = dashFor(el.style);
              return (
                <line
                  key={el.id}
                  className={`kr-line${hiClass}`}
                  x1={el.x1}
                  y1={el.y1}
                  x2={el.x2}
                  y2={el.y2}
                  stroke={el.color ?? INK}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  {...(dash ? { strokeDasharray: dash } : {})}
                />
              );
            }
            if (el.kind === 'curve') {
              const dash = dashFor(el.style);
              const d = `M ${el.x1} ${el.y1} Q ${el.cx} ${el.cy} ${el.x2} ${el.y2}`;
              const ang = Math.atan2(el.y2 - el.cy, el.x2 - el.cx);
              const s = 6;
              const head = el.arrow
                ? `M ${el.x2} ${el.y2} L ${el.x2 + s * Math.cos(ang + Math.PI - 0.4)} ${el.y2 + s * Math.sin(ang + Math.PI - 0.4)} L ${el.x2 + s * Math.cos(ang + Math.PI + 0.4)} ${el.y2 + s * Math.sin(ang + Math.PI + 0.4)} Z`
                : '';
              const color = el.color ?? INK;
              return (
                <g key={el.id}>
                  <path
                    className={`kr-line${hiClass}`}
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    {...(dash ? { strokeDasharray: dash } : {})}
                  />
                  {head && <path d={head} fill={color} stroke="none" />}
                </g>
              );
            }
            const fill = el.color ?? toneColor(el.tone) ?? (el.muted ? '#8a97a3' : INK);
            const size = el.small ? 13 : 18;
            const w = measureText(el.text, el.small ? SMALL_FONT : BASE_FONT);
            const bx = el.anchor === 'middle' ? el.x - w / 2 : el.anchor === 'end' ? el.x - w : el.x;
            // A word is marked if it's directly changed OR it's an endpoint of a
            // changed/added/removed relation in this frame's tree.
            const textHi = hi ?? (el.nodeId && impactedNodes.has(el.nodeId) ? 'changed' : null);
            return (
              <g key={el.id}>
                {textHi && !el.rotate && (
                  <rect
                    className={`vc-hi-rect vc-hi-${textHi}`}
                    x={bx - 3}
                    y={el.y - size * 0.72 - 2}
                    width={w + 6}
                    height={size * 0.95 + 4}
                    rx={3}
                  />
                )}
                <text
                  className={`kr-text${greek ? '' : ''}`}
                  x={el.x}
                  y={el.y}
                  textAnchor={el.anchor}
                  fontSize={size}
                  fontStyle={el.italic ? 'italic' : undefined}
                  fill={fill}
                  {...(el.rotate ? { transform: `rotate(${el.rotate} ${el.x} ${el.y})` } : {})}
                >
                  {el.text}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
});
