import type { Morphology, PartOfSpeech } from '@/domain/schema';
import { useEditorStore } from '@/state';
import { getNode } from '@/domain/model';
import { Modal } from '@/ui/components/common/Modal';

const POS: PartOfSpeech[] = [
  'noun', 'propernoun', 'pronoun', 'verb', 'participle', 'infinitive', 'adjective',
  'adverb', 'article', 'preposition', 'conjunction', 'particle', 'interjection',
  'numeral', 'determiner', 'unknown',
];

const MORPH_FIELDS: { key: keyof Morphology; label: string; options: string[] }[] = [
  { key: 'case', label: 'Case', options: ['nominative', 'genitive', 'dative', 'accusative', 'vocative'] },
  { key: 'gender', label: 'Gender', options: ['masculine', 'feminine', 'neuter', 'common', 'both'] },
  { key: 'number', label: 'Number', options: ['singular', 'dual', 'plural'] },
  { key: 'person', label: 'Person', options: ['first', 'second', 'third'] },
  { key: 'tense', label: 'Tense', options: ['present', 'imperfect', 'future', 'aorist', 'perfect', 'pluperfect'] },
  { key: 'voice', label: 'Voice', options: ['active', 'middle', 'passive', 'middlepassive'] },
  { key: 'mood', label: 'Mood', options: ['indicative', 'subjunctive', 'optative', 'imperative', 'infinitive', 'participle'] },
  { key: 'degree', label: 'Degree', options: ['positive', 'comparative', 'superlative'] },
];

const MANUAL = { source: 'manual', confidence: 'high' } as const;

/**
 * Word-level editing — lemma, gloss, part of speech, full morphology, and a
 * parsing note. The safest place for detailed edits; kept out of the diagram
 * views unless explicitly requested.
 */
export function MorphologyEditorModal({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const updateToken = useEditorStore((s) => s.updateToken);
  const updateNode = useEditorStore((s) => s.updateNode);
  const setImplied = useEditorStore((s) => s.setImplied);

  const node = getNode(doc.syntax, nodeId);
  const tok = node?.tokenIds.length ? doc.tokens.find((t) => t.id === node.tokenIds[0]) : undefined;
  const greek = doc.language === 'grc';
  if (!node) return null;

  const setMorph = (key: keyof Morphology, value: string) => {
    if (!tok) return;
    const morphology: Morphology = { ...(tok.morphology ?? {}) };
    if (value) (morphology as Record<string, unknown>)[key] = value;
    else delete (morphology as Record<string, unknown>)[key];
    updateToken(tok.id, { morphology, provenance: MANUAL });
  };

  return (
    <Modal
      title="Edit word details"
      onClose={onClose}
      footer={
        <div className="modal-buttons">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      {tok ? (
        <>
          <p className="rb-target">
            <span className={greek ? 'greek' : undefined}>{tok.surface}</span>
          </p>
          <div className="morph-grid">
            <label>
              Lemma
              <input
                className={greek ? 'greek' : undefined}
                value={tok.lemma ?? ''}
                onChange={(e) => updateToken(tok.id, { lemma: e.target.value, provenance: MANUAL })}
              />
            </label>
            <label>
              Gloss
              <input
                value={tok.gloss ?? ''}
                onChange={(e) => updateToken(tok.id, { gloss: e.target.value, provenance: MANUAL })}
              />
            </label>
            <label>
              Part of speech
              <select
                value={tok.pos ?? ''}
                onChange={(e) => updateToken(tok.id, { pos: (e.target.value || undefined) as PartOfSpeech, provenance: MANUAL })}
              >
                <option value="">—</option>
                {POS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            {MORPH_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <select value={(tok.morphology?.[f.key] as string) ?? ''} onChange={(e) => setMorph(f.key, e.target.value)}>
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
        </>
      ) : (
        <p className="hint">This element has no surface word (implied/elided).</p>
      )}

      <label className="morph-implied">
        <input
          type="checkbox"
          checked={Boolean(node.implied)}
          onChange={(e) => setImplied(nodeId, e.target.checked)}
        />
        Mark implied / elided
      </label>

      <label className="morph-note">
        Parsing note
        <textarea
          value={node.notes ?? ''}
          placeholder="Notes on this word's parsing…"
          onChange={(e) => updateNode(nodeId, { notes: e.target.value })}
        />
      </label>
    </Modal>
  );
}
