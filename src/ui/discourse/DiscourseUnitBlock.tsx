import { memo } from 'react';
import type { DiscourseRow } from '@/domain/discourse';
import { formatRange } from '@/domain/discourse';
import type { DiscourseViewToggles } from '@/state';
import { DiscourseMarkerChip } from './DiscourseMarkerChip';

/**
 * One discourse unit row: ref label, unit label, Greek text (or gloss text),
 * marker chips, indentation by outline depth, and a collapse chevron for
 * container units. Memoized — whole-book documents render hundreds of rows.
 */
export const DiscourseUnitBlock = memo(function DiscourseUnitBlock({
  row,
  view,
  selected,
  relationCount,
  registerEl,
  onSelect,
  onToggleCollapsed,
}: {
  row: DiscourseRow;
  view: DiscourseViewToggles;
  selected: boolean;
  /** Relations touching this unit (badge for accessibility / arc-free reading). */
  relationCount: number;
  registerEl: (unitId: string, el: HTMLElement | null) => void;
  onSelect: (unitId: string) => void;
  onToggleCollapsed?: (unitId: string, collapsed: boolean) => void;
}) {
  const { unit, tokens, markers, hasChildren } = row;
  const refLabel = formatRange(unit.refStart, unit.refEnd);
  const isContainer = unit.tokenIds.length === 0;
  const gloss = tokens.map((t) => t.gloss ?? '').filter(Boolean).join(' ');

  return (
    <div
      ref={(el) => registerEl(unit.id, el)}
      className={[
        'discourse-unit',
        isContainer ? 'container' : 'leaf',
        selected ? 'selected' : '',
        view.compact ? 'compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ marginLeft: unit.depth * 26 }}
      role="listitem"
      aria-label={`${unit.label ? `${unit.label}, ` : ''}${unit.kind} ${refLabel}`}
      data-unit-id={unit.id}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(unit.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(unit.id);
        }
      }}
    >
      <div className="discourse-unit-head">
        {hasChildren && onToggleCollapsed && (
          <button
            type="button"
            className="discourse-collapse"
            aria-expanded={!unit.collapsed}
            title={unit.collapsed ? 'Expand' : 'Collapse'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapsed(unit.id, !unit.collapsed);
            }}
          >
            {unit.collapsed ? '▸' : '▾'}
          </button>
        )}
        {refLabel && <span className="discourse-ref">{refLabel}</span>}
        {view.showLabels && unit.label && (
          <span className="discourse-label" title="Unit label (your analysis)">
            {unit.label}
          </span>
        )}
        {isContainer && !unit.label && (
          <span className="discourse-label muted">{unit.kind}</span>
        )}
        {relationCount > 0 && (
          <span
            className="discourse-relcount"
            title={`${relationCount} relation${relationCount === 1 ? '' : 's'} touch this unit — select it to list them`}
          >
            ⤳{relationCount}
          </span>
        )}
        {unit.notes && (
          <span className="discourse-notedot" title={unit.notes} aria-label="Has a note">
            ✎
          </span>
        )}
      </div>

      {!isContainer && view.showSourceText && (
        <p className={`discourse-text greek${view.compact ? ' clamp' : ''}`} lang="grc">
          {tokens.map((t) => t.surface).join(' ')}
        </p>
      )}
      {!isContainer && view.showEnglish && gloss && (
        <p className={`discourse-gloss${view.compact ? ' clamp' : ''}`}>{gloss}</p>
      )}

      {view.showMarkers && markers.length > 0 && (
        <div className="discourse-markers" aria-label="Discourse marker hints">
          {markers.map((m) => (
            <DiscourseMarkerChip key={m.id} marker={m} />
          ))}
        </div>
      )}
    </div>
  );
});
