import { useState } from 'react';
import { useEditorStore } from '@/state';
import { getNode, getRelation, nodeText } from '@/domain/model';
import { CLAUSE_TYPE_OPTIONS, MORPH_FIELDS, POS_OPTIONS, ROLE_OPTIONS } from '@/ui/options';
import type { Morphology, SyntacticRole, Token } from '@/domain/schema';

/**
 * Inspector panel: edit the current selection, plus an always-available control
 * to add a word. Tap a word/line in the diagram to populate the editor.
 */
export function Inspector() {
  return (
    <div>
      <SelectionEditor />
      <AddWord />
    </div>
  );
}

/** Grammatical editor for the current selection (token, node, or relation). */
function SelectionEditor() {
  const doc = useEditorStore((s) => s.doc);
  const sel = useEditorStore((s) => s.selection);
  const updateToken = useEditorStore((s) => s.updateToken);
  const updateNode = useEditorStore((s) => s.updateNode);
  const updateRelation = useEditorStore((s) => s.updateRelation);
  const removeRelation = useEditorStore((s) => s.removeRelation);
  const removeWord = useEditorStore((s) => s.removeWord);
  const startRelink = useEditorStore((s) => s.startRelink);
  const linking = useEditorStore((s) => s.linking);

  if (sel.tokenId) {
    const t = doc.tokens.find((x) => x.id === sel.tokenId);
    if (!t) return <Empty />;
    return <TokenInspector token={t} grc={doc.language === 'grc'} onChange={(p) => updateToken(t.id, p)} />;
  }

  if (sel.relationId) {
    const r = getRelation(doc.syntax, sel.relationId);
    if (!r) return <Empty />;
    const head = getNode(doc.syntax, r.headId);
    const dep = getNode(doc.syntax, r.dependentId);
    return (
      <div>
        <h3 className="section-title">Relation</h3>
        <label className="field">
          <span>Type</span>
          <select
            value={r.type}
            onChange={(e) => updateRelation(r.id, { type: e.target.value as SyntacticRole })}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <dl className="kv">
          <dt>Head</dt>
          <dd>{head ? nodeText(doc, head) || head.label || head.kind : '—'}</dd>
          <dt>Dependent</dt>
          <dd>{dep ? nodeText(doc, dep) || dep.label || dep.kind : '—'}</dd>
          <dt>Source</dt>
          <dd>
            {r.provenance?.source ?? 'manual'}
            {r.provenance?.confidence === 'low' && (
              <span className="tentative-tag"> · ambiguous</span>
            )}
          </dd>
        </dl>
        <div className="field">
          <span>Re-attach this connection</span>
          <div className="row">
            <button
              className="mini"
              disabled={linking?.relationId === r.id && linking.end === 'dependent'}
              onClick={() => startRelink(r.id, 'dependent')}
            >
              Pick word…
            </button>
            <button
              className="mini"
              disabled={linking?.relationId === r.id && linking.end === 'head'}
              onClick={() => startRelink(r.id, 'head')}
            >
              Pick head…
            </button>
          </div>
          {linking?.relationId === r.id && (
            <p className="hint" style={{ margin: '6px 0 0' }}>
              Click the word to use as the new <strong>{linking.end}</strong> (Esc to cancel).
            </p>
          )}
        </div>
        <label className="field">
          <span>Connector label</span>
          <input
            type="text"
            value={r.label ?? ''}
            onChange={(e) => updateRelation(r.id, { label: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Notes</span>
          <textarea value={r.notes ?? ''} onChange={(e) => updateRelation(r.id, { notes: e.target.value })} />
        </label>
        <button className="mini reject" onClick={() => removeRelation(r.id)}>
          Delete relation
        </button>
      </div>
    );
  }

  if (sel.nodeId) {
    const n = getNode(doc.syntax, sel.nodeId);
    if (!n) return <Empty />;
    return (
      <div>
        <h3 className="section-title">Node</h3>
        <dl className="kv">
          <dt>Text</dt>
          <dd className={doc.language === 'grc' ? 'greek' : undefined}>
            {nodeText(doc, n) || <em>implied</em>}
          </dd>
          <dt>Kind</dt>
          <dd>{n.kind}</dd>
          <dt>Source</dt>
          <dd>{n.provenance?.source ?? 'manual'}</dd>
        </dl>
        <label className="field">
          <span>Role</span>
          <select
            value={n.role ?? ''}
            onChange={(e) => updateNode(n.id, { role: (e.target.value || undefined) as SyntacticRole })}
          >
            <option value="">— none —</option>
            {ROLE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        {n.kind === 'clause' && (
          <label className="field">
            <span>Clause type</span>
            <select
              value={n.clauseType ?? ''}
              onChange={(e) =>
                updateNode(n.id, { clauseType: (e.target.value || undefined) as never })
              }
            >
              <option value="">— none —</option>
              {CLAUSE_TYPE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Label / display override</span>
          <input
            type="text"
            value={n.label ?? ''}
            onChange={(e) => updateNode(n.id, { label: e.target.value })}
          />
        </label>
        <label className="field row" style={{ alignItems: 'center' }}>
          <input
            type="checkbox"
            style={{ width: 'auto', flex: 'none' }}
            checked={Boolean(n.implied)}
            onChange={(e) => updateNode(n.id, { implied: e.target.checked })}
          />
          <span style={{ marginBottom: 0 }}>Implied / elided element</span>
        </label>
        <label className="field">
          <span>Notes</span>
          <textarea value={n.notes ?? ''} onChange={(e) => updateNode(n.id, { notes: e.target.value })} />
        </label>
        {/* A word node carries a token: edit its part of speech + morphology here
            too, so a single tap on a word edits both its function and its form. */}
        {(() => {
          const t = n.tokenIds[0] ? doc.tokens.find((x) => x.id === n.tokenIds[0]) : undefined;
          return t ? (
            <TokenInspector token={t} grc={doc.language === 'grc'} onChange={(p) => updateToken(t.id, p)} />
          ) : null;
        })()}
        {n.id !== doc.syntax.rootId && (
          <button className="mini reject" style={{ marginTop: 8 }} onClick={() => removeWord(n.id)}>
            Delete word
          </button>
        )}
      </div>
    );
  }

  return <Empty />;
}

/** Always-available control to add a word (e.g. for a variant reading). */
function AddWord() {
  const addWord = useEditorStore((s) => s.addWord);
  const [surface, setSurface] = useState('');
  const submit = () => {
    if (!surface.trim()) return;
    addWord(surface);
    setSurface('');
  };
  return (
    <div className="add-word">
      <h3 className="section-title">Add a word</h3>
      <div className="row">
        <input
          type="text"
          aria-label="New word"
          placeholder="word…"
          value={surface}
          onChange={(e) => setSurface(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="mini accept" disabled={!surface.trim()} onClick={submit}>
          Add
        </button>
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }}>
        Adds a word attached to the sentence; select it to set its role or re-link it.
      </p>
    </div>
  );
}

function Empty() {
  return (
    <p className="empty">
      Select a word, line, or token in the diagram or lists to inspect and edit
      its grammar.
    </p>
  );
}

function TokenInspector({
  token,
  grc,
  onChange,
}: {
  token: Token;
  grc: boolean;
  onChange: (patch: Partial<Token>) => void;
}) {
  const morph = token.morphology ?? {};
  const setMorph = (key: keyof Morphology, value: string) => {
    const next: Morphology = { ...morph };
    if (value) (next[key] as string) = value;
    else delete next[key];
    onChange({ morphology: next });
  };

  return (
    <div>
      <h3 className="section-title">Token</h3>
      <label className="field">
        <span>Surface</span>
        <input
          type="text"
          className={grc ? 'greek' : undefined}
          value={token.surface}
          onChange={(e) => onChange({ surface: e.target.value })}
        />
      </label>
      <div className="row">
        <label className="field">
          <span>Lemma</span>
          <input type="text" value={token.lemma ?? ''} onChange={(e) => onChange({ lemma: e.target.value })} />
        </label>
        <label className="field">
          <span>Gloss</span>
          <input type="text" value={token.gloss ?? ''} onChange={(e) => onChange({ gloss: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>Part of speech</span>
        <select
          value={token.pos ?? ''}
          onChange={(e) => onChange({ pos: (e.target.value || undefined) as Token['pos'] })}
        >
          <option value="">— none —</option>
          {POS_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <h3 className="section-title" style={{ marginTop: 4 }}>
        Morphology
      </h3>
      {MORPH_FIELDS.map((f) => (
        <label className="field" key={f.key}>
          <span>{f.key}</span>
          <select
            value={(morph[f.key as keyof Morphology] as string) ?? ''}
            onChange={(e) => setMorph(f.key as keyof Morphology, e.target.value)}
          >
            <option value="">—</option>
            {f.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
