import { useMemo, useState } from 'react';
import type { SyntacticRole } from '@/domain/schema';
import { useEditorStore } from '@/state';
import { ROLE_DESC, ROLE_LABEL, allRoles, relationPreview, suggestRolesForHead } from './roles';
import { nodeName } from './common';

/**
 * The one-tap relationship picker shown after a visual link is drawn (tap a
 * dependent, then a head). It leads with the likely labels for the head, hides
 * the full list under "More…", and saves immediately on tap — no modal, no long
 * dropdowns. "Advanced…" hands off to the full RelationBuilder.
 */
export function RelationshipQuickPicker({ onAdvanced }: { onAdvanced?: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const draft = useEditorStore((s) => s.relationshipDraft);
  const confirm = useEditorStore((s) => s.confirmRelationshipDraft);
  const cancel = useEditorStore((s) => s.cancelVisualLink);
  const [showMore, setShowMore] = useState(false);

  const suggestions = useMemo(
    () => (draft ? suggestRolesForHead(doc, draft.headId) : []),
    [doc, draft],
  );
  const more = useMemo(
    () => (draft ? allRoles().filter((r) => !suggestions.includes(r)) : []),
    [draft, suggestions],
  );

  if (!draft) return null;
  const greek = doc.language === 'grc';
  const dep = nodeName(doc, draft.dependentId);
  const head = nodeName(doc, draft.headId);

  const chip = (r: SyntacticRole) => (
    <button key={r} className="chip" title={ROLE_DESC[r]} onClick={() => confirm(r)}>
      {ROLE_LABEL[r]}
    </button>
  );

  return (
    <div className="quick-picker" role="dialog" aria-label="Choose relationship">
      <div className="quick-picker-head">
        <span className="quick-picker-title">
          <span className={greek ? 'greek' : undefined}>{dep}</span>
          {' → '}
          <span className={greek ? 'greek' : undefined}>{head}</span>
        </span>
        <button className="modal-x" onClick={cancel} aria-label="Cancel">
          ✕
        </button>
      </div>
      <p className="quick-picker-prompt">What is this relationship?</p>
      <div className="rb-chips">
        {suggestions.map(chip)}
        <button className="chip more" onClick={() => setShowMore((v) => !v)}>
          {showMore ? 'Fewer' : 'More…'}
        </button>
      </div>
      {showMore && <div className="rb-chips quick-picker-more">{more.map(chip)}</div>}
      <div className="quick-picker-foot">
        {onAdvanced && (
          <button className="link-btn" onClick={onAdvanced}>
            Advanced relationship builder…
          </button>
        )}
        <span className="quick-picker-preview">
          {relationPreview(doc, draft.dependentId, draft.headId, suggestions[0] ?? 'adjunct')}
        </span>
      </div>
    </div>
  );
}
