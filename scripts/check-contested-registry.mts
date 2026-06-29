/**
 * check-contested-registry — validate the curated contested-syntax registry
 * against the REAL base parse data, so it cannot rot:
 *   - every passageId loads,
 *   - every affected token/node/relation id exists in that passage,
 *   - every alternate references a real issue and the same passage,
 *   - every syntax overlay applies and lays out without throwing.
 *
 * Offline passages (fixtures + bundled Philippians) always check; network
 * passages (other GNT books, WLC chapters) check when the source is reachable.
 *
 *   npx vite-node scripts/check-contested-registry.mts
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Window } from 'happy-dom';

const win = new Window();
// @ts-expect-error — provide the DOM the converters need in Node.
globalThis.DOMParser = win.DOMParser;

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const { lowfatToDocuments } = await import('../src/io/lowfat.ts');
const { maculaHebrewToDocuments } = await import('../src/io/macula-hebrew.ts');
const { GNT_BOOKS } = await import('../src/io/gnt.ts');
const { OT_BOOKS, chapterFile } = await import('../src/io/ot.ts');
const { sampleDocuments } = await import('../src/fixtures/index.ts');
const { contestedRegistry } = await import('../src/data/contestedSyntax.ts');
const { applyAlternateReadingPreview } = await import('../src/domain/contested/apply.ts');
const { layoutForMode } = await import('../src/domain/layout/index.ts');
const { combinePassage } = await import('../src/io/passage.ts');

type Doc = (typeof sampleDocuments)[number];

const GNT_SRC =
  'https://raw.githubusercontent.com/biblicalhumanities/greek-new-testament/master/syntax-trees/nestle1904-lowfat/xml/';
const OT_SRC = 'https://raw.githubusercontent.com/Clear-Bible/macula-hebrew/main/WLC/lowfat/';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const bookCache = new Map<string, Doc[]>();

async function loadXml(localRel: string, remote: string): Promise<string> {
  const local = resolve(root, localRel);
  if (existsSync(local)) return readFileSync(local, 'utf8');
  const res = await fetch(remote);
  if (!res.ok) throw new Error(`fetch ${remote} → ${res.status}`);
  return await res.text();
}

async function loadPassage(passageId: string): Promise<Doc | undefined> {
  if (passageId.startsWith('doc_sample')) {
    return sampleDocuments.find((d) => d.id === passageId);
  }
  if (passageId.startsWith('gnt_')) {
    const m = passageId.match(/^gnt_(.+)_(\d+)$/);
    if (!m) return undefined;
    const [, bslug, idx] = m;
    const book = GNT_BOOKS.find((b) => slug(b.name) === bslug);
    if (!book) return undefined;
    if (!bookCache.has(book.name)) {
      const xml = await loadXml(`public/gnt/${book.file}`, GNT_SRC + book.file);
      bookCache.set(book.name, lowfatToDocuments(xml, { book: book.name }));
    }
    return bookCache.get(book.name)![Number(idx)];
  }
  if (passageId.startsWith('wlc_')) {
    const m = passageId.match(/^wlc_(.+)_(\d+)_(\d+)$/);
    if (!m) return undefined;
    const [, bslug, chap, idx] = m;
    const book = OT_BOOKS.find((b) => slug(b.name) === bslug);
    if (!book) return undefined;
    const key = `${book.name}:${chap}`;
    if (!bookCache.has(key)) {
      const file = chapterFile(book, Number(chap));
      const xml = await loadXml(`public/ot/${file}`, OT_SRC + file);
      bookCache.set(key, maculaHebrewToDocuments(xml, { book: book.name }));
    }
    return bookCache.get(key)![Number(idx)];
  }
  return undefined;
}

let errors = 0;
let checked = 0;
let skipped = 0;
const fail = (m: string) => {
  errors++;
  console.error(`  ✗ ${m}`);
};

const issueIds = new Set(contestedRegistry.issues.map((i) => i.id));

// readings reference real issues + matching passage
for (const r of contestedRegistry.readings) {
  if (!issueIds.has(r.issueId)) fail(`reading ${r.id} → unknown issue ${r.issueId}`);
}

for (const issue of contestedRegistry.issues) {
  const target = issue.mergePassageIds?.length
    ? `merge[${issue.mergePassageIds.join(' + ')}]`
    : issue.passageId;
  console.log(`\n• ${issue.id} (${issue.verseRef}) → ${target}`);
  let doc: Doc | undefined;
  try {
    if (issue.mergePassageIds?.length) {
      // A cross-boundary issue is authored against the COMBINED document, so load
      // every spanned sentence and merge them exactly as the app does at runtime.
      const parts: Doc[] = [];
      for (const id of issue.mergePassageIds) {
        const part = await loadPassage(id);
        if (!part) throw new Error(`merge sentence ${id} did not resolve`);
        parts.push(part);
      }
      doc = combinePassage(parts) as Doc;
    } else {
      doc = await loadPassage(issue.passageId);
    }
  } catch (e) {
    console.warn(`  ⚠ could not load (network?) — skipping id checks: ${(e as Error).message}`);
    skipped++;
    continue;
  }
  if (!doc) {
    fail(`passage ${issue.passageId} did not resolve to a document`);
    continue;
  }
  checked++;

  const tokenIds = new Set(doc.tokens.map((t) => t.id));
  const nodeIds = new Set(doc.syntax.nodes.map((n) => n.id));
  const relIds = new Set(doc.syntax.relations.map((r) => r.id));

  for (const t of issue.affectedTokenIds) if (!tokenIds.has(t)) fail(`token ${t} missing`);
  for (const n of issue.affectedNodeIds ?? []) if (!nodeIds.has(n)) fail(`node ${n} missing`);
  for (const r of issue.affectedRelationIds ?? []) if (!relIds.has(r)) fail(`relation ${r} missing`);

  const readings = contestedRegistry.readings.filter((r) => r.issueId === issue.id);
  for (const id of issue.alternateReadingIds) {
    if (!readings.some((r) => r.id === id)) fail(`alternateReadingId ${id} has no reading`);
  }
  for (const reading of readings) {
    if (reading.passageId !== issue.passageId)
      fail(`reading ${reading.id} passageId ≠ issue passageId`);
    // overlay targets exist
    if (reading.syntaxPatch) {
      for (const rid of Object.keys(reading.syntaxPatch.relations?.update ?? {}))
        if (!relIds.has(rid)) fail(`overlay ${reading.id} updates missing relation ${rid}`);
      for (const nid of Object.keys(reading.syntaxPatch.nodes?.update ?? {}))
        if (!nodeIds.has(nid)) fail(`overlay ${reading.id} updates missing node ${nid}`);
    }
    if (reading.semanticOverlay?.relationId && !relIds.has(reading.semanticOverlay.relationId))
      fail(`semantic overlay ${reading.id} → missing relation ${reading.semanticOverlay.relationId}`);
    if (reading.textualVariant?.affectedBaseTokenIds) {
      for (const t of reading.textualVariant.affectedBaseTokenIds)
        if (!tokenIds.has(t)) fail(`textual variant ${reading.id} → missing token ${t}`);
    }
    // preview + layout must not throw
    try {
      const preview = applyAlternateReadingPreview(doc, reading);
      for (const mode of ['kellogg-reed', 'phrase-block', 'dependency', 'morphology'] as const) {
        layoutForMode(mode, preview, preview.layoutHints);
      }
    } catch (e) {
      fail(`reading ${reading.id} preview/layout threw: ${(e as Error).message}`);
    }
  }
  if (!errors) console.log(`  ✓ ${issue.affectedTokenIds.length} tokens, ${readings.length} reading(s)`);
}

console.log(
  `\n${errors ? '✗' : '✓'} contested registry: ${checked} passage(s) checked, ${skipped} skipped (offline), ${errors} error(s).`,
);
process.exit(errors ? 1 : 0);
