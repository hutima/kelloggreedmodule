import { useState } from 'react';
import { useDiscourseStore } from '@/state';
import { DiscourseRelationTypeSchema, type DiscourseRelationType } from '@/domain/schema';
import { formatRange, relationTypeLabel } from '@/domain/discourse';

/**
 * Relation TYPE picker — shown once both ends of a new relation are chosen
 * (source unit → "Relate →" → target unit). Confirming creates a manual,
 * user-authored relation; Escape/Cancel discards the draft. A custom type
 * asks for its label.
 */
export function DiscourseRelationPicker() {
  const doc = useDiscourseStore((s) => s.doc);
  const draft = useDiscourseStore((s) => s.relationDraft);
  const addRelation = useDiscourseStore((s) => s.addRelation);
  const setRelationDraft = useDiscourseStore((s) => s.setRelationDraft);
  const [label, setLabel] = useState('');

  if (!doc || !draft) return null;
  const name = (id: string) => {
    const u = doc.units.find((x) => x.id === id);
    return u ? u.label || formatRange(u.refStart, u.refEnd) || u.kind : id;
  };

  const choose = (type: DiscourseRelationType) => {
    addRelation({
      sourceUnitId: draft.sourceUnitId,
      targetUnitId: draft.targetUnitId,
      type,
      label: label.trim() || undefined,
    });
    setRelationDraft(null);
  };

  return (
    <div className="discourse-relation-picker" role="dialog" aria-label="Choose relation type">
      <div className="discourse-relation-picker-head">
        <strong>
          {name(draft.sourceUnitId)} → {name(draft.targetUnitId)}
        </strong>
        <button className="mini" onClick={() => setRelationDraft(null)} aria-label="Cancel">
          ✕
        </button>
      </div>
      <label className="field">
        <span>Label (optional)</span>
        <input
          value={label}
          placeholder="e.g. “ground for the command”, “A ↔ A′”"
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <div className="discourse-relation-types">
        {DiscourseRelationTypeSchema.options.map((t) => (
          <button key={t} className="mini" onClick={() => choose(t)}>
            {relationTypeLabel(t)}
          </button>
        ))}
      </div>
      <p className="discourse-note">
        The relation reads “<em>source</em> is the {`{type}`} of/for <em>target</em>” — your
        analysis, stamped as user-authored.
      </p>
    </div>
  );
}
