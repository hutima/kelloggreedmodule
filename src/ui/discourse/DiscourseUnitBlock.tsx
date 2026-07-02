import { memo } from 'react';
import type { DiscourseRow } from '@/domain/discourse';
import { formatRange } from '@/domain/discourse';
import type { DiscourseViewToggles } from '@/state';
import { DiscourseMarkerChip } from './DiscourseMarkerChip';

/**
 * One discourse unit row: ref label, unit label, Greek text (or gloss text),
 * marker chips, indentation by outline depth, and a collapse chevron for
 * container units. Memoized — whole-book documents render hundreds of rows.
 *
 * Edit-mode affordances are additive props: `splitPicking` renders the text as
 * clickable words (pick where the new unit starts), `relateTarget` highlights
 * the row as a valid relation target, `multiSelected` shows the wrap-group
 * selection. All of them are inert in Explore mode.
 */
export const DiscourseUnitBlock = memo(function DiscourseUnitBlock({
  row,
  view,
  isEnglish = false,
  selected,
  relationCount,
  registerEl,
  onSelect,
  onToggleCollapsed,
  multiSelected = false,
  splitPicking = false,
  relateTarget = false,
  onTokenSplit,
}: {
  row: DiscourseRow;
  view: DiscourseViewToggles;
  /** English-only source (BSB/KJV/ASV): always show the English source text,
   *  no Greek font/lang, no gloss line. */
  isEnglish?: boolean;
  selected: boolean;
  /** Relations touching this unit (badge for accessibility / arc-free reading). */
  relationCount: number;
  registerEl: (unitId: string, el: HTMLElement | null) => void;
  onSelect: (unitId: string, opts: { shift: boolean }) => void;
  onToggleCollapsed?: (unitId: string, collapsed: boolean) => void;
  multiSelected?: boolean;
  splitPicking?: boolean;
  relateTarget?: boolean;
  onTokenSplit?: (unitId: string, tokenId: string) => void;
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
        multiSelected && !selected ? 'multi-selected' : '',
        relateTarget ? 'relate-target' : '',
        splitPicking ? 'split-picking' : '',
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
        onSelect(unit.id, { shift: e.shiftKey });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          // Plain selection only — the view-level handler owns edit shortcuts.
          if (e.currentTarget === e.target) {
            e.preventDefault();
            onSelect(unit.id, { shift: e.shiftKey });
          }
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
        {relateTarget && <span className="discourse-target-hint">← relate here</span>}
      </div>

      {!isContainer && (isEnglish || view.showSourceText) && !splitPicking && (
        <p
          className={`discourse-text${isEnglish ? '' : ' greek'}${view.compact ? ' clamp' : ''}`}
          lang={isEnglish ? 'en' : 'grc'}
        >
          {tokens.map((t) => t.surface).join(' ')}
        </p>
      )}
      {!isContainer && splitPicking && (
        <p
          className={`discourse-text${isEnglish ? '' : ' greek'} discourse-split-words`}
          lang={isEnglish ? 'en' : 'grc'}
        >
          {tokens.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className="discourse-split-word"
              disabled={i === 0}
              title={
                i === 0
                  ? 'A unit cannot start empty — pick a later word'
                  : `Start the new unit at “${t.surface}” (${t.ref})`
              }
              onClick={(e) => {
                e.stopPropagation();
                onTokenSplit?.(unit.id, t.id);
              }}
            >
              {t.surface}
            </button>
          ))}
        </p>
      )}
      {!isContainer && view.showEnglish && gloss && !splitPicking && (
        <p className={`discourse-gloss${view.compact ? ' clamp' : ''}`}>{gloss}</p>
      )}

      {view.showMarkers && markers.length > 0 && !splitPicking && (
        <div className="discourse-markers" aria-label="Discourse marker hints">
          {markers.map((m) => (
            <DiscourseMarkerChip key={m.id} marker={m} />
          ))}
        </div>
      )}
    </div>
  );
});
