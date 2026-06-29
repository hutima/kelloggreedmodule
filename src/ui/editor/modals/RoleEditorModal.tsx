import { useMemo, useState } from 'react';
import type { SyntacticRole } from '@/domain/schema';
import { useEditorStore } from '@/state';
import { getNode, parentRelations, nodeText } from '@/domain/model';
import { Modal } from '@/ui/components/common/Modal';
import { ROLE_DESC, ROLE_LABEL, allRoles, relationPreview, suggestRolesForHead } from '../roles';

/**
 * Simple role change with contextual suggestions; the full list hides under
 * "More…". Setting a role also aligns the node's incoming relation type, so the
 * change is consistent across every view.
 */
export function RoleEditorModal({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const setNodeRole = useEditorStore((s) => s.setNodeRole);

  const node = getNode(doc.syntax, nodeId);
  const parent = parentRelations(doc.syntax, nodeId)[0];
  const [role, setRole] = useState<SyntacticRole | undefined>(node?.role);
  const [showMore, setShowMore] = useState(false);
  const [search, setSearch] = useState('');
  const greek = doc.language === 'grc';

  const suggestions = useMemo(
    () => (parent ? suggestRolesForHead(doc, parent.headId) : ['subject', 'directObject', 'adjectival', 'adverbial', 'genitive'] as SyntacticRole[]),
    [doc, parent],
  );
  const moreRoles = allRoles().filter(
    (r) =>
      !suggestions.includes(r) &&
      (search ? `${ROLE_LABEL[r]} ${r}`.toLowerCase().includes(search.toLowerCase()) : true),
  );

  const word = node ? nodeText(doc, node) || node.label || node.kind : '';
  const preview =
    role && parent
      ? relationPreview(doc, nodeId, parent.headId, role)
      : role
        ? `${word} is marked as a ${ROLE_LABEL[role]}.`
        : '';

  const save = () => {
    if (!role) return;
    setNodeRole(nodeId, role);
    onClose();
  };

  return (
    <Modal
      title="Change role"
      onClose={onClose}
      footer={
        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!role}>
            Save
          </button>
        </div>
      }
    >
      <p className="rb-target">
        <span className={greek ? 'greek' : undefined}>{word}</span>
      </p>
      <div className="rb-chips">
        {suggestions.map((r) => (
          <button
            key={r}
            className={`chip${role === r ? ' active' : ''}`}
            title={ROLE_DESC[r]}
            onClick={() => setRole(r)}
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
            placeholder="Search roles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="rb-chips">
            {moreRoles.map((r) => (
              <button
                key={r}
                className={`chip${role === r ? ' active' : ''}`}
                title={ROLE_DESC[r]}
                onClick={() => setRole(r)}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="rb-preview">
        {preview ? (
          <p className={greek ? 'greek' : undefined}>{preview}</p>
        ) : (
          <p className="hint">Pick a role to see a preview.</p>
        )}
        {role && ROLE_DESC[role] && <p className="rb-desc">{ROLE_DESC[role]}</p>}
      </div>
    </Modal>
  );
}
