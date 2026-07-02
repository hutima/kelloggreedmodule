/**
 * dump-passage-syntax — print the REAL token / node / relation ids of a passage
 * from the current base parse data, so the contested-syntax registry can be
 * authored against actual ids (never guessed).
 *
 *   npx vite-node scripts/dump-passage-syntax.mts -- "Php 1:1"
 *   npx vite-node scripts/dump-passage-syntax.mts -- "Rom 9:5"
 *   npx vite-node scripts/dump-passage-syntax.mts -- "Gen 1:1"
 *   npx vite-node scripts/dump-passage-syntax.mts -- fixture:doc_sample_1john_1_1
 *   npx vite-node scripts/dump-passage-syntax.mts -- sblgnt:"Php 1:1"
 *
 * A `sblgnt:` prefix dumps the SBLGNT Lowfat (MACULA Greek) edition instead of
 * the Nestle1904 default — the two editions mint DIFFERENT ids for the same
 * passage, so a contested-syntax entry anchored to one must be dumped and
 * authored against that edition specifically.
 *
 * GNT books and Hebrew chapters are read from the bundled `public/` copy when
 * present, else fetched from the upstream macula source.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Window } from 'happy-dom';

// lowfat/macula conversion needs a DOMParser; provide happy-dom's in Node.
const win = new Window();
// @ts-expect-error — install the DOM globals the converters rely on.
globalThis.DOMParser = win.DOMParser;

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const { lowfatToDocuments, sblgntDialect } = await import('../src/io/lowfat.ts');
const { maculaHebrewToDocuments } = await import('../src/io/macula-hebrew.ts');
const { GNT_BOOKS } = await import('../src/io/gnt.ts');
const { OT_BOOKS, chapterFile } = await import('../src/io/ot.ts');
const { sampleDocuments } = await import('../src/fixtures/index.ts');

type KrDocument = (typeof sampleDocuments)[number];

const GNT_SRC =
  'https://raw.githubusercontent.com/biblicalhumanities/greek-new-testament/master/syntax-trees/nestle1904-lowfat/xml/';
const SBLGNT_SRC = 'https://raw.githubusercontent.com/Clear-Bible/macula-greek/main/SBLGNT/lowfat/';
const OT_SRC = 'https://raw.githubusercontent.com/Clear-Bible/macula-hebrew/main/WLC/lowfat/';

async function loadXml(localRel: string, remote: string): Promise<string> {
  const local = resolve(root, localRel);
  if (existsSync(local)) return readFileSync(local, 'utf8');
  const res = await fetch(remote);
  if (!res.ok) throw new Error(`fetch ${remote} → ${res.status}`);
  return await res.text();
}

function findBook<T extends { name: string; abbr: string }>(books: T[], q: string): T | undefined {
  const n = q.toLowerCase().replace(/\s+/g, '');
  return books.find(
    (b) =>
      b.name.toLowerCase().replace(/\s+/g, '') === n ||
      b.abbr.toLowerCase() === n ||
      b.name.toLowerCase().replace(/\s+/g, '').startsWith(n),
  );
}

/** Whether a sentence's title (e.g. "Titus 2:11–14") covers chapter:verse. */
function coversRef(title: string, chap: number, verse: number): boolean {
  const m = title.match(/(\d+):(\d+)(?:[–-](\d+))?\s*$/);
  if (!m) return false;
  const c = Number(m[1]);
  const v0 = Number(m[2]);
  const v1 = m[3] ? Number(m[3]) : v0;
  return c === chap && verse >= v0 && verse <= v1;
}

async function resolvePassage(rawArg: string): Promise<KrDocument[]> {
  const sblgnt = rawArg.startsWith('sblgnt:');
  const arg = sblgnt ? rawArg.slice('sblgnt:'.length) : rawArg;
  if (arg.startsWith('fixture:')) {
    const id = arg.slice('fixture:'.length);
    const doc = sampleDocuments.find((d) => d.id === id);
    return doc ? [doc] : [];
  }
  // "<book> <chap>:<verse>" — book may contain a leading numeral (1 John).
  const m = arg.match(/^(.*?)[\s.]*(\d+):(\d+)/);
  if (!m) throw new Error(`Could not parse passage "${arg}". Try "Php 1:1".`);
  const [, bookRaw, chapS, verseS] = m;
  const chap = Number(chapS);
  const verse = Number(verseS);

  const gnt = findBook(GNT_BOOKS, bookRaw!.trim());
  if (gnt) {
    if (sblgnt) {
      const xml = await loadXml(`public/sblgnt/${gnt.file}`, SBLGNT_SRC + gnt.file);
      const docs = lowfatToDocuments(xml, {
        book: gnt.name,
        dialect: sblgntDialect,
        docIdPrefix: 'sblgnt',
      });
      return docs.filter((d) => coversRef(d.title, chap, verse));
    }
    const xml = await loadXml(`public/gnt/${gnt.file}`, GNT_SRC + gnt.file);
    const docs = lowfatToDocuments(xml, { book: gnt.name });
    return docs.filter((d) => coversRef(d.title, chap, verse));
  }
  const ot = findBook(OT_BOOKS as unknown as { name: string; abbr: string }[], bookRaw!.trim());
  if (ot) {
    const book = OT_BOOKS.find((b) => b.name === (ot as { name: string }).name)!;
    const file = chapterFile(book, chap);
    const xml = await loadXml(`public/ot/${file}`, OT_SRC + file);
    const docs = maculaHebrewToDocuments(xml, { book: book.name });
    return docs.filter((d) => coversRef(d.title, chap, verse));
  }
  throw new Error(`Unknown book "${bookRaw}".`);
}

function dump(doc: KrDocument): void {
  console.log('═'.repeat(72));
  console.log(`passageId : ${doc.id}`);
  console.log(`title     : ${doc.title}`);
  console.log(`language  : ${doc.language}`);
  console.log(`rootId    : ${doc.syntax.rootId}`);
  console.log(`text      : ${doc.text}`);
  console.log('\nTOKENS (id · index · surface · lemma · pos · gloss):');
  for (const t of doc.tokens) {
    console.log(
      `  ${t.id}\t${t.index}\t${t.surface}\t${t.lemma ?? ''}\t${t.pos ?? ''}\t${t.gloss ?? ''}`,
    );
  }
  console.log('\nNODES (id · kind · role · clauseType · tokenIds · label):');
  for (const n of doc.syntax.nodes) {
    console.log(
      `  ${n.id}\t${n.kind}\t${n.role ?? ''}\t${n.clauseType ?? ''}\t[${n.tokenIds.join(',')}]\t${n.label ?? ''}`,
    );
  }
  console.log('\nRELATIONS (id · type · head → dependent · label):');
  for (const r of doc.syntax.relations) {
    console.log(`  ${r.id}\t${r.type}\t${r.headId} → ${r.dependentId}\t${r.label ?? ''}`);
  }
  console.log('═'.repeat(72) + '\n');
}

const arg = process.argv.slice(2).join(' ').trim();
if (!arg) {
  console.error('Usage: vite-node scripts/dump-passage-syntax.mts -- "Php 1:1"');
  process.exit(1);
}
const docs = await resolvePassage(arg);
if (!docs.length) {
  console.error(`No passage found for "${arg}".`);
  process.exit(2);
}
for (const d of docs) dump(d);
console.log(`(${docs.length} sentence document(s) matched)`);
