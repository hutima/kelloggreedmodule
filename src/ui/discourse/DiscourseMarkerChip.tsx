import type { DiscourseMarker } from '@/domain/schema';
import { markerFunctionLabel } from '@/domain/discourse';

/**
 * A discourse-marker chip (γάρ, οὖν, δέ…). Markers are HINTS derived from the
 * source's particles — the tooltip and label always say "possible", never
 * "detected": particles are clues, not a magisterium.
 */
export function DiscourseMarkerChip({
  marker,
  selected = false,
  onClick,
}: {
  marker: DiscourseMarker;
  selected?: boolean;
  onClick?: () => void;
}) {
  const hint = markerFunctionLabel(marker.suggestedFunction);
  const reason = marker.provenance.reason ? ` ${marker.provenance.reason}.` : '';
  return (
    <button
      type="button"
      className={`discourse-marker-chip${selected ? ' selected' : ''}`}
      title={`${marker.surface} (${marker.ref}) — ${hint}. A hint from the source's particles, not a conclusion.${reason}`}
      aria-label={`Marker ${marker.surface}, ${hint}`}
      onClick={onClick}
    >
      <span className="greek">{marker.surface}</span>
      <span className="discourse-marker-fn">{hint.replace(/^possible /, '')}?</span>
    </button>
  );
}
