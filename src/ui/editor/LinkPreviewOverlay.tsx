/**
 * Visual link preview — a dashed arc from the chosen dependent toward the
 * candidate head while the Link tool is active. Rendered INSIDE the diagram's
 * `<svg>` so its coordinates are in layout space. When no head is hovered yet it
 * pulses a ring on the start word so the pending-link state is unmistakable.
 */
export interface Point {
  x: number;
  y: number;
}

export function LinkPreviewOverlay({ from, to }: { from: Point; to: Point | null }) {
  if (!to) {
    return (
      <g className="link-preview" pointerEvents="none">
        <circle className="link-preview-start" cx={from.x} cy={from.y - 5} r={11} />
      </g>
    );
  }
  // A gentle quadratic arc bulging upward, with an arrowhead at the head.
  const midX = (from.x + to.x) / 2;
  const midY = Math.min(from.y, to.y) - 28 - Math.abs(from.x - to.x) * 0.04;
  const ang = Math.atan2(to.y - midY, to.x - midX);
  const s = 7;
  const head = `M ${to.x} ${to.y} L ${to.x + s * Math.cos(ang + Math.PI - 0.4)} ${
    to.y + s * Math.sin(ang + Math.PI - 0.4)
  } L ${to.x + s * Math.cos(ang + Math.PI + 0.4)} ${to.y + s * Math.sin(ang + Math.PI + 0.4)} Z`;
  return (
    <g className="link-preview" pointerEvents="none">
      <circle className="link-preview-start" cx={from.x} cy={from.y - 5} r={6} />
      <path
        className="link-preview-arc"
        d={`M ${from.x} ${from.y - 5} Q ${midX} ${midY} ${to.x} ${to.y}`}
        fill="none"
      />
      <path className="link-preview-head" d={head} />
    </g>
  );
}
