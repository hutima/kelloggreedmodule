/** Tiny legend explaining the difference-highlight colours (subtle, neutral). */
export function DifferenceLegend() {
  return (
    <div className="diff-legend" aria-hidden="true">
      <span className="diff-legend-item">
        <span className="diff-swatch changed" /> changed
      </span>
      <span className="diff-legend-item">
        <span className="diff-swatch added" /> added
      </span>
      <span className="diff-legend-item">
        <span className="diff-swatch removed" /> removed
      </span>
    </div>
  );
}
