import { useEditorStore } from '@/state';
import { makeId } from '@/domain/model';
import { POS_OPTIONS } from '@/ui/options';
import type { Token } from '@/domain/schema';

/** Editable list of surface tokens. */
export function TokenList() {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const updateToken = useEditorStore((s) => s.updateToken);
  const setTokens = useEditorStore((s) => s.setTokens);

  const addToken = () => {
    const token: Token = {
      id: makeId('tok'),
      index: doc.tokens.length,
      surface: '',
      language: doc.language,
      provenance: { source: 'manual', confidence: 'high' },
    };
    setTokens([...doc.tokens, token]);
    select({ tokenId: token.id });
  };

  const removeToken = (id: string) =>
    setTokens(doc.tokens.filter((t) => t.id !== id));

  if (doc.tokens.length === 0) {
    return (
      <div>
        <p className="empty">
          No tokens yet. Enter text and tokenize, or add tokens manually.
        </p>
        <button className="mini accept" onClick={addToken}>
          + Add token
        </button>
      </div>
    );
  }

  return (
    <div>
      {[...doc.tokens]
        .sort((a, b) => a.index - b.index)
        .map((t) => (
          <div
            key={t.id}
            className={`token-row${selection.tokenId === t.id ? ' selected' : ''}`}
            onClick={() => select({ tokenId: t.id })}
          >
            <div className="idx">{t.index}</div>
            <div>
              <input
                type="text"
                className={doc.language === 'grc' ? 'greek' : undefined}
                value={t.surface}
                onChange={(e) => updateToken(t.id, { surface: e.target.value })}
                placeholder="surface"
              />
              <div className="row" style={{ marginTop: 4 }}>
                <select
                  value={t.pos ?? ''}
                  onChange={(e) =>
                    updateToken(t.id, { pos: (e.target.value || undefined) as Token['pos'] })
                  }
                >
                  <option value="">— pos —</option>
                  {POS_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={t.gloss ?? ''}
                  onChange={(e) => updateToken(t.id, { gloss: e.target.value })}
                  placeholder="gloss"
                />
              </div>
            </div>
            <button
              className="mini reject"
              title="Remove token"
              onClick={(e) => {
                e.stopPropagation();
                removeToken(t.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      <button className="mini accept" onClick={addToken} style={{ marginTop: 6 }}>
        + Add token
      </button>
    </div>
  );
}
