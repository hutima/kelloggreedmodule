import { useMemo, useState } from 'react';
import type { SyntacticRole } from '@/domain/schema';
import { useEditorStore } from '@/state';
import { getRelation } from '@/domain/model';
import { Modal } from '@/ui/components/common/Modal';
import { selectableNodes } from '../common';
import {
  ROLE_DESC,
  ROLE_LABEL,
  allRoles,
  relationPreview,
  suggestRolesForHead,
} from '../roles';

/**
 * Guided relationship builder: dependent → head → relationship type → plain-
 * language preview → save. Contextual chips come first; the full list hides
 * under "More…". Editing an existing relation locks its endpoints and only
 * changes the type. Every save flows to the shared syntax graph as a manual
 * edit, so all other views update.
 */
export function RelationBuilderModal({
  dependentId,
  headId,
  relationId,
  onClose,
}: {
  dependentId?: string;
  headId?: string;
  relationId?: string;
  onClose: () => void;
}) {
  const doc = useEditorStore((s) => s.doc);
  const attachNodeTo = useEditorStore((s) => s.attachNodeTo);
  const changeRelationType = useEditorStore((s) => s.changeRelationType);

  const existing = relationId ? getRelation(doc.syntax, relationId) : undefined;
  const [depId, setDepId] = useState<string | undefined>(dependentId ?? existing?.dependentId);
  const [hId, setHId] = useState<string | undefined>(headId ?? existing?.headId);
  const [type, setType] = useState<SyntacticRole | undefined>(existing?.type);
  const [showMore, setShowMore] = useState(false);
  const [search, setSearch] = useState('');

  const nodes = useMemo(() => selectableNodes(doc), [doc]);
  const depLocked = Boolean(dependentId || existing);
  const headLocked = Boolean(headId || existing);
  const greek = doc.language === 'grc';

  const suggestions = hId ? suggestRolesForHead(doc, hId) : [];
  const moreRoles = allRoles().filter(
    (r) =>
      !suggestions.includes(r) &&
      (search ? `${ROLE_LABEL[r]} ${r}`.toLowerCase().includes(search.toLowerCase()) : true),
  );

  const canSave = Boolean(depId && hId && type && depId !== hId);

  const save = () => {
    if (!canSave) return;
    if (existing) changeRelationType(existing.id, type!);
    else attachNodeTo(depId!, hId!, type!);
    onClose();
  };

  const NodeList = ({
    value,
    onPick,
    exclude,
  }: {
    value?: string;
    onPick: (id: string) => void;
    exclude?: string;
  }) => (
    <div className="rb-nodelist">
      {nodes
        .filter((n) => n.id !== exclude)
        .map((n) => (
          <button
            key={n.id}
            className={`rb-node${value === n.id ? ' active' : ''}${greek ? ' greek' : ''}`}
            onClick={() => onPick(n.id)}
          >
            {n.label}
            {n.isRoot && <small> (clause)</small>}
          </button>
        ))}
    </div>
  );

  return (
    <Modal
      title={existing ? 'Change relationship' : 'Build relationship'}
      onClose={onClose}
      footer={
        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!canSave}>
            Save
          </button>
        </div>
      }
    >
      <div className="rb-step">
        <span className="rb-step-label">1 · Dependent</span>
        {depLocked ? (
          <span className={`rb-fixed${greek ? ' greek' : ''}`}>
            {nodes.find((n) => n.id === depId)?.label ?? '(?)'}
          </span>
        ) : (
          <NodeList value={depId} onPick={setDepId} exclude={hId} />
        )}
      </div>

      <div className="rb-step">
        <span className="rb-step-label">2 · Head</span>
        {headLocked ? (
          <span className={`rb-fixed${greek ? ' greek' : ''}`}>
            {nodes.find((n) => n.id === hId)?.label ?? '(?)'}
          </span>
        ) : (
          <NodeList value={hId} onPick={setHId} exclude={depId} />
        )}
      </div>

      <div className="rb-step">
        <span className="rb-step-label">3 · Relationship</span>
        {!hId ? (
          <p className="hint">Choose a head first to see suggestions.</p>
        ) : (
          <>
            <div className="rb-chips">
              {suggestions.map((r) => (
                <button
                  key={r}
                  className={`chip${type === r ? ' active' : ''}`}
                  title={ROLE_DESC[r]}
                  onClick={() => setType(r)}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
              <button className="chip more" onClick={() => setShowMore((v) => !v)}>
                {showMore ? 'Less' : 'More…'}
              </button>
            </div>
            {showMore && (
              <div className="rb-more">
                <input
                  className="rb-search"
                  placeholder="Search relationship types…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="rb-chips">
                  {moreRoles.map((r) => (
                    <button
                      key={r}
                      className={`chip${type === r ? ' active' : ''}`}
                      title={ROLE_DESC[r]}
                      onClick={() => setType(r)}
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="rb-preview">
        {canSave ? (
          <p className={greek ? 'greek' : undefined}>{relationPreview(doc, depId!, hId!, type!)}</p>
        ) : (
          <p className="hint">Pick a dependent, a head, and a relationship to see a preview.</p>
        )}
        {type && ROLE_DESC[type] && <p className="rb-desc">{ROLE_DESC[type]}</p>}
      </div>
    </Modal>
  );
}
