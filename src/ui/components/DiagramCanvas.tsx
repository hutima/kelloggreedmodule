import { useMemo, useState } from 'react';
import { useEditorStore } from '@/state';
import { layoutDocument } from '@/domain/layout';
import { dashFor } from '@/domain/render';

/**
 * Interactive SVG canvas. It renders exactly the primitives the layout engine
 * emits — it has no knowledge of tokens or word order — and adds selection and
 * zoom. Because export uses the same layout, the picture is identical on paper.
 */
export function DiagramCanvas() {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const [scale, setScale] = useState(1);
  const [collapsed, setCollapsed] = useState(false);

  const layout = useMemo(
    () => layoutDocument(doc, doc.layoutHints),
    [doc],
  );

  const isSelected = (nodeId?: string, relationId?: string) =>
    (nodeId && nodeId === selection.nodeId) ||
    (relationId && relationId === selection.relationId);

  return (
    <div className={`canvas${collapsed ? ' collapsed' : ''}`}>
      <div className="panel-head">
        <span className="panel-head-title">Diagram</span>
        <div className="canvas-zoom">
          <button title="Zoom out" onClick={() => setScale((s) => Math.max(0.4, s - 0.1))}>
            −
          </button>
          <button title="Reset zoom" onClick={() => setScale(1)}>
            ⊙
          </button>
          <button title="Zoom in" onClick={() => setScale((s) => Math.min(3, s + 0.1))}>
            +
          </button>
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
      <div className="canvas-wrap">
        <div className="diagram-surface">
        <svg
          className="diagram-paper"
          width={layout.width * scale}
          height={layout.height * scale}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-label={`Kellogg-Reed diagram of: ${doc.text || doc.title}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) select({});
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
                    x1={el.x1}
                    y1={el.y1}
                    x2={el.x2}
                    y2={el.y2}
                    stroke="#1f2933"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    {...(dash ? { strokeDasharray: dash } : {})}
                  />
                  {(el.nodeId || el.relationId) && (
                    <line
                      className="kr-hit"
                      x1={el.x1}
                      y1={el.y1}
                      x2={el.x2}
                      y2={el.y2}
                      onClick={() =>
                        select(
                          el.relationId
                            ? { relationId: el.relationId }
                            : { nodeId: el.nodeId },
                        )
                      }
                    />
                  )}
                </g>
              );
            }
            const sel = isSelected(el.nodeId, el.relationId);
            return (
              <text
                key={el.id}
                className={`kr-text${sel ? ' selected' : ''}`}
                x={el.x}
                y={el.y}
                textAnchor={el.anchor}
                fontSize={el.small ? 13 : 18}
                fontStyle={el.italic ? 'italic' : undefined}
                fill={el.muted ? '#8a97a3' : '#1f2933'}
                {...(el.rotate ? { transform: `rotate(${el.rotate} ${el.x} ${el.y})` } : {})}
                onClick={() =>
                  el.nodeId
                    ? select({ nodeId: el.nodeId })
                    : el.relationId
                      ? select({ relationId: el.relationId })
                      : select({})
                }
              >
                {el.text}
              </text>
            );
          })}
        </svg>
        </div>
      </div>
    </div>
  );
}
