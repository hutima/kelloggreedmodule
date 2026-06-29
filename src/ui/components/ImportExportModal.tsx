import { useState } from 'react';
import { useEditorStore } from '@/state';
import { systemClock } from '@/domain/model';
import {
  buildPassagePackage,
  buildPatch,
  exportAllUserData,
  detectImport,
  downloadText,
  slugify,
  type ImportDetect,
} from '@/io';
import { savePatch, saveSermonPrep } from '@/persistence';
import { hashBase } from '@/domain/patch';
import { Modal } from './common/Modal';

/**
 * Import / export hub for USER DATA (diffs, notes, highlights, sermon prep,
 * backups). Diagram image/PDF export stays in the Export dialog. Exports prefer
 * compact diffs; imports are detected, validated, and confirmed before applying,
 * and warn on a base/source mismatch so base data is never silently corrupted.
 */
export function ImportExportModal({ onClose }: { onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc);
  const baseDoc = useEditorStore((s) => s.baseDoc);
  const corpus = useEditorStore((s) => s.corpus);
  const sermon = useEditorStore((s) => s.sermon);
  const reloadCurrent = useEditorStore((s) => s.reloadCurrent);
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const setSermonPrep = useEditorStore((s) => s.setSermonPrep);

  const [text, setText] = useState('');
  const [detected, setDetected] = useState<ImportDetect | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const base = slugify(doc.title || 'passage');

  const dl = (name: string, payload: unknown) =>
    downloadText(JSON.stringify(payload, null, 2), `${name}.json`, 'application/json');

  const exportDiff = () => {
    if (!baseDoc) {
      setMsg('This passage has no base assignment to diff against — export the full document instead.');
      return;
    }
    dl(`${base}-diff`, buildPatch(baseDoc, doc, corpus, systemClock()));
  };
  const exportPackage = (full: boolean) =>
    dl(`${base}-package`, buildPassagePackage({ doc, base: baseDoc, corpus, sermon, includeFullDocument: full }, systemClock()));
  const exportSermon = () => dl(`${base}-sermon`, sermon);
  const exportFull = () => dl(`${base}-document`, doc);
  const exportNotes = () => downloadText(doc.notes || '', `${base}-notes.txt`, 'text/plain');
  const exportBackup = () => dl('kr-backup', exportAllUserData(systemClock()));

  const onFile = async (file: File) => {
    const t = await file.text();
    setText(t);
    setDetected(detectImport(t));
    setMsg(null);
  };
  const onCheck = () => {
    setDetected(detectImport(text));
    setMsg(null);
  };

  const apply = () => {
    if (!detected?.ok) return;
    try {
      switch (detected.kind) {
        case 'document':
          loadDocument(detected.document!, { corpus: 'custom' });
          setMsg('Imported document.');
          break;
        case 'patch': {
          const p = detected.patch!;
          savePatch(p.base.passageId, p);
          if (baseDoc && p.base.passageId === baseDoc.id) reloadCurrent();
          setMsg(
            baseDoc && p.base.baseHash && p.base.baseHash !== hashBase(baseDoc)
              ? 'Applied, but the diff was made against a different base version — double-check the relationships.'
              : 'Applied custom edits.',
          );
          break;
        }
        case 'sermon': {
          const s = detected.sermon!;
          saveSermonPrep(s.passageId, s);
          if (s.passageId === doc.id) setSermonPrep(s);
          setMsg('Imported sermon prep.');
          break;
        }
        case 'package': {
          const pkg = detected.pkg!;
          if (pkg.patch) savePatch(pkg.patch.base.passageId, pkg.patch);
          if (pkg.sermonPrep) saveSermonPrep(pkg.sermonPrep.passageId, pkg.sermonPrep);
          if (pkg.document && (!baseDoc || pkg.document.id !== baseDoc.id)) {
            loadDocument(pkg.document, { corpus: pkg.corpus });
          } else {
            reloadCurrent();
          }
          setMsg(`Imported package for ${pkg.reference || 'passage'}.`);
          break;
        }
        case 'backup': {
          const b = detected.backup!;
          for (const p of b.patches) savePatch(p.base.passageId, p);
          for (const s of b.sermonPrep) saveSermonPrep(s.passageId, s);
          reloadCurrent();
          setMsg(`Restored ${b.patches.length} edit set(s) and ${b.sermonPrep.length} sermon record(s).`);
          break;
        }
      }
      setDetected(null);
      setText('');
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  const confirmText = (() => {
    if (!detected) return null;
    if (!detected.ok) return detected.error ?? 'Unrecognized file.';
    switch (detected.kind) {
      case 'document':
        return `This file is a full document: “${detected.document!.title}”. Open it?`;
      case 'patch': {
        const p = detected.patch!;
        const mismatch = baseDoc && p.base.baseHash && p.base.baseHash !== hashBase(baseDoc);
        return mismatch
          ? 'This file was created against a different base source or version. Applying it may produce incorrect relationships. Continue?'
          : `This file contains custom edits for passage ${p.base.passageId}. Apply them?`;
      }
      case 'sermon':
        return `This file contains sermon prep (${detected.sermon!.notes.length} notes, ${detected.sermon!.highlights.length} highlights). Apply it?`;
      case 'package':
        return `This file is a passage package for “${detected.pkg!.reference}”. Apply its edits and notes?`;
      case 'backup':
        return `This is a full backup: ${detected.backup!.patches.length} edit set(s), ${detected.backup!.sermonPrep.length} sermon record(s). Restore all to this device?`;
    }
  })();

  return (
    <Modal
      title="Import / Export data"
      onClose={onClose}
      wide
      footer={
        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <section className="ie-section">
        <h3>Export this passage</h3>
        <div className="ie-buttons">
          <button className="btn" onClick={exportDiff}>Assignment diff</button>
          <button className="btn" onClick={exportFull}>Full document</button>
          <button className="btn" onClick={exportSermon}>Sermon prep</button>
          <button className="btn" onClick={exportNotes}>Notes (text)</button>
          <button className="btn" onClick={() => exportPackage(false)}>Package (diff)</button>
          <button className="btn" onClick={() => exportPackage(true)}>Package (full)</button>
        </div>
      </section>

      <section className="ie-section">
        <h3>Export all data</h3>
        <div className="ie-buttons">
          <button className="btn" onClick={exportBackup}>Backup everything</button>
        </div>
        <p className="hint">A backup includes every custom edit diff and sermon-prep record on this device.</p>
      </section>

      <section className="ie-section">
        <h3>Import</h3>
        <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <textarea
          className="ie-import"
          placeholder="…or paste exported JSON here"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {text && !detected && (
          <button className="btn" onClick={onCheck}>Check file</button>
        )}
        {confirmText && (
          <div className={`ie-confirm${detected?.ok ? '' : ' error'}`}>
            <p>{confirmText}</p>
            {detected?.ok && (
              <div className="modal-buttons">
                <button className="btn" onClick={() => setDetected(null)}>Cancel</button>
                <button className="btn primary" onClick={apply}>Apply</button>
              </div>
            )}
          </div>
        )}
        {msg && <p className="ie-msg">{msg}</p>}
      </section>
    </Modal>
  );
}
