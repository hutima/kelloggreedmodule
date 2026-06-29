import { useState } from 'react';
import { useEditorStore } from '@/state';
import { getNode } from '@/domain/model';
import { Modal } from '@/ui/components/common/Modal';

/**
 * BASIC word edit — a deliberately light gloss editor for sermon prep: just the
 * English gloss (and the lemma if you want it), no part-of-speech or morphology
 * grid. Full parsing lives in the Advanced Word Details modal.
 */
const MANUAL = { source: 'manual', confidence: 'high' } as const;

export function QuickGlossModal({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const updateToken = useEditorStore((s) => s.updateToken);
  const node = getNode(doc.syntax, nodeId);
  const tok = node?.tokenIds.length ? doc.tokens.find((t) => t.id === node.tokenIds[0]) : undefined;
  const greek = doc.language === 'grc';

  const [gloss, setGloss] = useState(tok?.gloss ?? '');
  const [lemma, setLemma] = useState(tok?.lemma ?? '');

  if (!node) return null;

  const save = () => {
    if (tok) {
      updateToken(tok.id, {
        gloss: gloss.trim() || undefined,
        lemma: lemma.trim() || undefined,
        provenance: MANUAL,
      });
    }
    onClose();
  };

  return (
    <Modal
      title="Quick gloss"
      onClose={onClose}
      footer={
        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </div>
      }
    >
      {tok ? (
        <>
          <p className="rb-target">
            <span className={greek ? 'greek' : undefined}>{tok.surface}</span>
          </p>
          <label className="qg-field">
            English gloss
            <input
              autoFocus
              value={gloss}
              placeholder="e.g. word, beginning, God…"
              onChange={(e) => setGloss(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </label>
          <label className="qg-field">
            Lemma (optional)
            <input
              className={greek ? 'greek' : undefined}
              value={lemma}
              onChange={(e) => setLemma(e.target.value)}
            />
          </label>
          <p className="hint">For full parsing (case, tense, mood…), open Advanced Word Details.</p>
        </>
      ) : (
        <p className="hint">This element has no surface word (implied/elided).</p>
      )}
    </Modal>
  );
}
