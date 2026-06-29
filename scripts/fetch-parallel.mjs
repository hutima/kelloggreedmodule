#!/usr/bin/env node
/**
 * Build per-book PARALLEL ENGLISH text for the GNT, from Clear-Bible's manually
 * word-aligned data (the same data family as our Nestle1904 syntax trees).
 *
 *   node scripts/fetch-parallel.mjs            # all 27 NT books
 *   node scripts/fetch-parallel.mjs 11 12      # only the given book numbers
 *
 * Output: public/parallel/bsb/NN-book.json — one compact file per book, holding
 * the English (Berean Standard Bible) verse prose plus a lexeme-tagged
 * Greek→English word alignment so hovering a word links the two.
 *
 * Sources (all CC-BY 4.0 / public domain):
 *   • Greek words   data/sources/SBLGNT.tsv               (id, strongs, lemma…)
 *   • English words data/eng/targets/BSB/nt_BSB.tsv       (id, text, isPunc…)
 *   • Alignment     data/eng/alignments/BSB/SBLGNT-BSB-manual.json
 * from https://github.com/Clear-Bible/Alignments .
 *
 * The alignment's Greek base is SBLGNT, which is ~99% identical to our
 * Nestle1904 but not byte-for-byte. So we DON'T trust word POSITION alone — we
 * record each Greek word's Strong's number and lemma, and the runtime matches
 * Nestle1904 words to these by lexeme. That recovers alignment even in
 * textual-variant verses, where a variant typically shifts only a word or two.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const RAW = 'https://raw.githubusercontent.com/Clear-Bible/Alignments/main/';
const FILES = {
  greek: 'data/sources/SBLGNT.tsv',
  english: 'data/eng/targets/BSB/nt_BSB.tsv',
  align: 'data/eng/alignments/BSB/SBLGNT-BSB-manual.json',
};

/** Canonical 1-27 → display name; SBLGNT/BSB book numbers are these + 39 (Matt=40). */
const BOOKS = [
  'matthew', 'mark', 'luke', 'john', 'acts', 'romans', '1corinthians',
  '2corinthians', 'galatians', 'ephesians', 'philippians', 'colossians',
  '1thessalonians', '2thessalonians', '1timothy', '2timothy', 'titus',
  'philemon', 'hebrews', 'james', '1peter', '2peter', '1john', '2john',
  '3john', 'jude', 'revelation',
];
const NAMES = [
  'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
  '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians',
  '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus',
  'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John',
  '3 John', 'Jude', 'Revelation',
];

/** Fetch a source file once, caching the raw bytes under the OS temp dir. */
async function cached(rel) {
  const cacheDir = join(tmpdir(), 'kr-parallel-cache');
  await mkdir(cacheDir, { recursive: true });
  const path = join(cacheDir, rel.replace(/[/]/g, '__'));
  if (existsSync(path)) return readFile(path, 'utf8');
  process.stdout.write(`  ↓ ${rel} … `);
  const res = await fetch(RAW + rel);
  if (!res.ok) throw new Error(`FAILED ${rel} (${res.status})`);
  const text = await res.text();
  await writeFile(path, text);
  console.log(`${(text.length / 1e6).toFixed(1)} MB`);
  return text;
}

/** Parse a TSV into rows of objects keyed by the header columns. */
function tsv(text) {
  const lines = text.split('\n').filter((l) => l.length);
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => {
    const cells = l.split('\t');
    const row = {};
    head.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

/** "G0976" / "G0976+G1234" → first integer Strong's number (0 if none). */
function strongInt(s) {
  const m = /(\d+)/.exec(s ?? '');
  return m ? Number(m[1]) : 0;
}

/** Split a word id "n40001001005" / "40001001005" into [bb, cc, vv, ww]. */
function splitId(id) {
  const d = id.replace(/^n/, '');
  return [+d.slice(0, 2), +d.slice(2, 5), +d.slice(5, 8), +d.slice(8, 11)];
}

const only = process.argv.slice(2).map(Number);
const wantedNums = only.length ? only : BOOKS.map((_, i) => i + 1);

console.log('Loading Clear-Bible alignment sources (cached after first run)…');
const [greekTsv, engTsv, alignJson] = await Promise.all([
  cached(FILES.greek),
  cached(FILES.english),
  cached(FILES.align),
]);

// Greek words → strong + lemma, keyed by their full id.
const greek = new Map();
for (const r of tsv(greekTsv)) {
  greek.set(r.id.replace(/^n/, ''), { strong: strongInt(r.strongs), lemma: r.lemma });
}

// English (BSB) words grouped per verse, in id order. The BSB target schema is
//   id  source_verse  text  skip_space_after  exclude  id_range_end  …
// `words` is a flat list of surface strings; `nosp` records indices after which
// no space is inserted (skip_space_after); `excl` records excluded tokens
// (punctuation / added words) that are never alignment targets nor hoverable.
// posOfId maps an English word id → its 0-based index within that verse's list.
const engVerse = new Map(); // "bb.cc.vv" → { words, nosp, excl }
const posOfId = new Map(); // english id → index in its verse list
for (const r of tsv(engTsv)) {
  const sv = r.source_verse || r.id; // BBCCCVVV bucket for the row
  const [bb, cc, vv] = splitId(sv.length > 8 ? sv : sv + '000');
  const key = `${bb}.${cc}.${vv}`;
  let v = engVerse.get(key);
  if (!v) engVerse.set(key, (v = { words: [], nosp: [], excl: [] }));
  const i = v.words.length;
  posOfId.set(r.id, i);
  if (r.skip_space_after === 'y') v.nosp.push(i);
  if (r.exclude === 'y') v.excl.push(i);
  v.words.push(r.text);
}

// Alignment records: Greek source id(s) → English target id(s).
// Collapse to: per Greek word, the set of English positions it maps to.
const align = JSON.parse(alignJson);
const gLinks = new Map(); // greek id → Set(english positions, as "key#pos")
for (const rec of align.records) {
  const enPos = [];
  for (const tid of rec.target) {
    const pos = posOfId.get(tid);
    if (pos === undefined) continue;
    const [bb, cc, vv] = splitId(tid);
    enPos.push(`${bb}.${cc}.${vv}#${pos}`);
  }
  for (const sid of rec.source) {
    const gid = sid.replace(/^n/, '');
    let set = gLinks.get(gid);
    if (!set) gLinks.set(gid, (set = new Set()));
    for (const p of enPos) set.add(p);
  }
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'parallel', 'bsb');
await mkdir(outDir, { recursive: true });

let totalBytes = 0;
for (const num of wantedNums) {
  const bb = num + 39; // Matthew = 40
  const name = NAMES[num - 1];

  // verses: "cc.vv" → string[] (English words); nosp/excl: "cc.vv" → number[]
  // (no-space-after indices / excluded-token indices); links: "cc.vv" → [{ g, s, en, lem? }]
  const verses = {};
  const nosp = {};
  const excl = {};
  const links = {};

  // English prose per verse (only verses that belong to this book).
  for (const [key, v] of engVerse) {
    const [eb, cc, vv] = key.split('.').map(Number);
    if (eb !== bb) continue;
    verses[`${cc}.${vv}`] = v.words;
    if (v.nosp.length) nosp[`${cc}.${vv}`] = v.nosp;
    if (v.excl.length) excl[`${cc}.${vv}`] = v.excl;
  }

  // Greek words of this book, in canonical order, with their English links.
  // The lexeme key is the Strong's number `s`; `lem` is kept only as a fallback
  // when no Strong's number is available.
  const gids = [...greek.keys()].filter((id) => +id.slice(0, 2) === bb);
  gids.sort();
  for (const gid of gids) {
    const [, cc, vv, ww] = splitId(gid);
    const vkey = `${cc}.${vv}`;
    const info = greek.get(gid);
    const en = [];
    for (const p of gLinks.get(gid) ?? []) {
      const [pk, pos] = p.split('#');
      if (pk === `${bb}.${cc}.${vv}`) en.push(Number(pos));
    }
    en.sort((a, b) => a - b);
    const link = { g: ww, s: info.strong, en };
    if (!info.strong && info.lemma) link.lem = info.lemma;
    (links[vkey] ??= []).push(link);
  }

  const doc = { version: 'BSB', book: name, bookNum: num, verses, nosp, excl, links };
  const json = JSON.stringify(doc);
  const file = join(outDir, `${String(num).padStart(2, '0')}-${BOOKS[num - 1]}.json`);
  await writeFile(file, json);
  totalBytes += json.length;
  console.log(`  ${name}: ${Object.keys(verses).length} verses, ${(json.length / 1e3).toFixed(0)} KB`);
}

console.log(`Done. ${wantedNums.length} book(s), ${(totalBytes / 1e6).toFixed(2)} MB total → public/parallel/bsb/`);
