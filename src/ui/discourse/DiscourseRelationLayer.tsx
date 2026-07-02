import { memo } from 'react';
import type { DiscourseRelation } from '@/domain/schema';
import { relationColor, relationTypeLabel } from '@/domain/discourse';

/**
 * SVG overlay drawing relation arcs/brackets in the left gutter of the
 * discourse view. Arcs connect the vertical midpoints of the two unit blocks;
 * nested (shorter) arcs sit closer to the text so crossings stay readable.
 * Arcs are never the ONLY reading of a relation — the unit inspector lists
 * relations textually for the selected unit.
 */

export interface ArcSpec {
  relation: DiscourseRelation;
  /** Content-relative y midpoints of the two endpoint blocks. */
  y1: number;
  y2: number;
}

export const DiscourseRelationLayer = memo(function DiscourseRelationLayer({
  arcs,
  height,
  gutter,
  selectedRelationId,
  onSelect,
}: {
  arcs: ArcSpec[];
  height: number;
  gutter: number;
  selectedRelationId?: string;
  onSelect?: (relationId: string) => void;
}) {
  if (!arcs.length || height <= 0) return null;
  // Shorter spans hug the text; longer spans bow farther into the gutter.
  const sorted = [...arcs].sort(
    (a, b) => Math.abs(a.y1 - a.y2) - Math.abs(b.y1 - b.y2),
  );
  const lanes = new Map<string, number>();
  sorted.forEach((a, i) => lanes.set(a.relation.id, i));
  const laneStep = Math.max(10, Math.min(22, (gutter - 16) / Math.max(1, arcs.length)));

  return (
    <svg
      className="discourse-arcs"
      width={gutter}
      height={height}
      viewBox={`0 0 ${gutter} ${height}`}
      aria-hidden="true"
    >
      {sorted.map((a) => {
        const { relation } = a;
        const color = relationColor(relation.type);
        const lane = lanes.get(relation.id) ?? 0;
        const x0 = gutter - 2;
        const x = Math.max(8, gutter - 10 - lane * laneStep);
        const top = Math.min(a.y1, a.y2);
        const bottom = Math.max(a.y1, a.y2);
        const selected = relation.id === selectedRelationId;
        const midY = (top + bottom) / 2;
        const label = relation.label || relationTypeLabel(relation.type);
        const paired = relation.type === 'chiasm' || relation.type === 'parallel' || relation.type === 'inclusio';
        return (
          <g
            key={relation.id}
            className={`discourse-arc${selected ? ' selected' : ''}`}
            style={{ cursor: onSelect ? 'pointer' : 'default', pointerEvents: 'all' }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(relation.id);
            }}
          >
            <title>
              {label} — {relationTypeLabel(relation.type)}
              {relation.confidence ? ` (${relation.confidence})` : ''}
            </title>
            {/* Bracket-style path: out from the source, down/up, back to target. */}
            <path
              d={`M ${x0} ${a.y1} H ${x} V ${a.y2} H ${x0}`}
              fill="none"
              stroke={color}
              strokeWidth={selected ? 2.4 : 1.6}
              strokeDasharray={paired ? '5 3' : undefined}
              opacity={selected ? 1 : 0.8}
            />
            {/* Arrowhead into the target end. */}
            <path
              d={`M ${x0 - 5} ${a.y2 - 4} L ${x0} ${a.y2} L ${x0 - 5} ${a.y2 + 4}`}
              fill="none"
              stroke={color}
              strokeWidth={selected ? 2.2 : 1.6}
            />
            <text
              x={Math.max(4, x - 4)}
              y={midY}
              className="discourse-arc-label"
              fill={color}
              textAnchor="end"
              dominantBaseline="middle"
              transform={`rotate(-90 ${Math.max(4, x - 4)} ${midY})`}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
});
