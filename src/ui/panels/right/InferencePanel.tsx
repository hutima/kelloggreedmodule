import { useEditorStore } from '@/state';

/**
 * Assisted-mode inference review. Every suggestion is provisional and carries
 * source/confidence/reason; the analyst accepts or rejects each one (or all).
 */
export function InferencePanel() {
  const inferences = useEditorStore((s) => s.inferences);
  const refresh = useEditorStore((s) => s.refreshInferences);
  const accept = useEditorStore((s) => s.acceptInference);
  const reject = useEditorStore((s) => s.rejectInference);
  const acceptAll = useEditorStore((s) => s.acceptAllInferences);
  const rejectAll = useEditorStore((s) => s.rejectAllInferences);

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="mini" onClick={refresh}>
          ↻ Re-run
        </button>
        <button className="mini accept" onClick={acceptAll} disabled={!inferences.length}>
          Accept all
        </button>
        <button className="mini reject" onClick={rejectAll} disabled={!inferences.length}>
          Reject all
        </button>
      </div>

      {inferences.length === 0 ? (
        <p className="empty">
          No pending inferences. Re-run after editing tokens, or switch to
          Assisted mode to generate suggestions.
        </p>
      ) : (
        inferences.map((inf) => (
          <div className="inference" key={inf.id}>
            <div className="head">
              <span className="title">{inf.title}</span>
              <span className={`badge ${inf.provenance.confidence}`}>
                {inf.provenance.confidence}
              </span>
            </div>
            <p className="reason">{inf.provenance.reason}</p>
            <div className="meta">
              <span className="badge">{inf.category}</span>
              <span className="badge">source: {inf.provenance.source}</span>
            </div>
            <div className="actions">
              <button className="mini accept" onClick={() => accept(inf.id)}>
                Accept
              </button>
              <button className="mini reject" onClick={() => reject(inf.id)}>
                Reject
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
