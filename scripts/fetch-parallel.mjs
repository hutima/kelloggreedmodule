#!/usr/bin/env node
/**
 * Build per-book PARALLEL ENGLISH text from Clear-Bible's manually word-aligned
 * data (the same data family as our macula syntax trees), for BOTH testaments.
 *
 *   node scripts/fetch-parallel.mjs            # all 27 NT books
 *   node scripts/fetch-parallel.mjs 11 12      # only the given NT book numbers
 *   node scripts/fetch-parallel.mjs --ot       # all 39 OT books
 *   node scripts/fetch-parallel.mjs --ot 1 19  # only the given OT book numbers
 *
 * Output: public/parallel/bsb/NN-book.json (NT) and
 *         public/parallel/bsb/ot/NN-book.json (OT) — one compact file per book,
 * holding the English (Berean Standard Bible) verse prose plus a word alignment
 * so hovering a word links the two.
 *
 * Sources (all CC-BY 4.0 / public domain), from Clear-Bible/Alignments:
 *   NT  Greek    data/sources/SBLGNT.tsv
 *       English  data/eng/targets/BSB/nt_BSB.tsv
 *       Align    data/eng/alignments/BSB/SBLGNT-BSB-manual.json
 *   OT  Hebrew   data/sources/WLC.tsv
 *       English  data/eng/targets/BSB/ot_BSB.tsv
 *       Align    data/eng/alignments/BSB/WLCM-BSB-manual.json
 *
 * NT: the alignment's Greek base is SBLGNT, ~99% but not byte-identical to our
 * Nestle1904, so we match Nestle1904 words to it by Strong's LEXEME (nearest
 * position breaking ties), surviving textual variants.
 *
 * OT: the WLC alignment uses the SAME word ids as our macula-hebrew trees
 * (o010010010011 = our xml:id), so each link carries that morpheme id and the
 * runtime matches EXACTLY by id — no lexeme guessing needed. The word's Strong's
 * number rides along only as a fallback.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const RAW = 'https://raw.githubusercontent.com/Clear-Bible/Alignments/main/';

const NT_FILES = {
  greek: 'data/sources/SBLGNT.tsv',
  english: 'data/eng/targets/BSB/nt_BSB.tsv',
  align: 'data/eng/alignments/BSB/SBLGNT-BSB-manual.json',
};
const OT_FILES = {
  hebrew: 'data/sources/WLC.tsv',
  english: 'data/eng/targets/BSB/ot_BSB.tsv',
  align: 'data/eng/alignments/BSB/WLCM-BSB-manual.json',
};

/** NT canonical 1-27 → slug; SBLGNT/BSB book numbers are these + 39 (Matt=40). */
const NT_BOOKS = [
  'matthew', 'mark', 'luke', 'john', 'acts', 'romans', '1corinthians',
  '2corinthians', 'galatians', 'ephesians', 'philippians', 'colossians',
  '1thessalonians', '2thessalonians', '1timothy', '2timothy', 'titus',
  'philemon', 'hebrews', 'james', '1peter', '2peter', '1john', '2john',
  '3john', 'jude', 'revelation',
];
const NT_NAMES = [
  'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
  '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians',
  '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus',
  'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John',
  '3 John', 'Jude', 'Revelation',
];

/** OT canonical 1-39 → slug; WLC/BSB OT book numbers are these directly (Gen=01). */
const OT_BOOKS = [
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua',
  'judges', 'ruth', '1samuel', '2samuel', '1kings', '2kings', '1chronicles',
  '2chronicles', 'ezra', 'nehemiah', 'esther', 'job', 'psalms', 'proverbs',
  'ecclesiastes', 'songofsongs', 'isaiah', 'jeremiah', 'lamentations',
  'ezekiel', 'daniel', 'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah',
  'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi',
];
const OT_NAMES = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua',
  'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
  '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job',
  'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Songs', 'Isaiah', 'Jeremiah',
  'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah',
  'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
  'Malachi',
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

/** "G0976" / "H0871a" / "0871a" → first integer (0 if none). */
function strongInt(s) {
  const m = /(\d+)/.exec(s ?? '');
  return m ? Number(m[1]) : 0;
}

/** Split a word id "n40001001005" / "40001001005" into [bb, cc, vv, ww]. */
function splitId(id) {
  const d = id.replace(/^n/, '');
  return [+d.slice(0, 2), +d.slice(2, 5), +d.slice(5, 8), +d.slice(8, 11)];
}

/** Build the English-per-verse index shared by both testaments. */
function indexEnglish(engTsv) {
  const engVerse = new Map(); // "bb.cc.vv" → { words, nosp, excl }
  const posOfId = new Map(); // english id → index in its verse list
  for (const r of tsv(engTsv)) {
    const sv = r.source_verse || r.id;
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
  return { engVerse, posOfId };
}

/** Per-book English verses/nosp/excl for book number `bb` (in the id scheme). */
function bookEnglish(engVerse, bb) {
  const verses = {};
  const nosp = {};
  const excl = {};
  for (const [key, v] of engVerse) {
    const [eb, cc, vv] = key.split('.').map(Number);
    if (eb !== bb) continue;
    verses[`${cc}.${vv}`] = v.words;
    if (v.nosp.length) nosp[`${cc}.${vv}`] = v.nosp;
    if (v.excl.length) excl[`${cc}.${vv}`] = v.excl;
  }
  return { verses, nosp, excl };
}

const outRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'parallel', 'bsb');

async function buildNt(wantedNums) {
  console.log('Loading Clear-Bible NT alignment sources (cached after first run)…');
  const [greekTsv, engTsv, alignJson] = await Promise.all([
    cached(NT_FILES.greek),
    cached(NT_FILES.english),
    cached(NT_FILES.align),
  ]);

  const greek = new Map();
  for (const r of tsv(greekTsv)) {
    greek.set(r.id.replace(/^n/, ''), { strong: strongInt(r.strongs), lemma: r.lemma });
  }
  const { engVerse, posOfId } = indexEnglish(engTsv);

  const align = JSON.parse(alignJson);
  const gLinks = new Map();
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

  await mkdir(outRoot, { recursive: true });
  let totalBytes = 0;
  for (const num of wantedNums) {
    const bb = num + 39; // Matthew = 40
    const name = NT_NAMES[num - 1];
    const { verses, nosp, excl } = bookEnglish(engVerse, bb);
    const links = {};
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
    const file = join(outRoot, `${String(num).padStart(2, '0')}-${NT_BOOKS[num - 1]}.json`);
    await writeFile(file, json);
    totalBytes += json.length;
    console.log(`  ${name}: ${Object.keys(verses).length} verses, ${(json.length / 1e3).toFixed(0)} KB`);
  }
  console.log(`Done (NT). ${wantedNums.length} book(s), ${(totalBytes / 1e6).toFixed(2)} MB → ${outRoot}`);
}

async function buildOt(wantedNums) {
  console.log('Loading Clear-Bible OT alignment sources (cached after first run)…');
  // Matching is purely by shared word id, so the Hebrew source TSV isn't needed —
  // only the English target and the alignment.
  const [engTsv, alignJson] = await Promise.all([
    cached(OT_FILES.english),
    cached(OT_FILES.align),
  ]);
  const { engVerse, posOfId } = indexEnglish(engTsv);

  // Alignment: WLC morpheme id → the English positions it maps to.
  const align = JSON.parse(alignJson);
  const hLinks = new Map(); // wid → Set("bb.cc.vv#pos")
  for (const rec of align.records) {
    const enPos = [];
    for (const tid of rec.target) {
      const pos = posOfId.get(tid);
      if (pos === undefined) continue;
      const [bb, cc, vv] = splitId(tid);
      enPos.push(`${bb}.${cc}.${vv}#${pos}`);
    }
    for (const sid of rec.source) {
      let set = hLinks.get(sid);
      if (!set) hLinks.set(sid, (set = new Set()));
      for (const p of enPos) set.add(p);
    }
  }

  const outDir = join(outRoot, 'ot');
  await mkdir(outDir, { recursive: true });
  let totalBytes = 0;
  for (const num of wantedNums) {
    const bb = num; // OT book numbers are 1-39 in every id scheme here
    const name = OT_NAMES[num - 1];
    const { verses, nosp, excl } = bookEnglish(engVerse, bb);
    const links = {};
    const wids = [...hLinks.keys()].filter((id) => +id.replace(/^o/, '').slice(0, 2) === bb);
    wids.sort();
    for (const wid of wids) {
      const d = wid.replace(/^o/, ''); // 12 digits: bb ccc vvv www m
      const cc = +d.slice(2, 5);
      const vv = +d.slice(5, 8);
      const vkey = `${cc}.${vv}`;
      const en = [];
      for (const p of hLinks.get(wid) ?? []) {
        const [pk, pos] = p.split('#');
        if (pk === `${bb}.${cc}.${vv}`) en.push(Number(pos));
      }
      if (!en.length) continue; // unaligned morpheme: no link needed
      en.sort((a, b) => a - b);
      // macula-hebrew and WLC share the SAME word ids, so the runtime matches by
      // id EXACTLY (no lexeme/position fallback). `i` is the per-verse morpheme
      // key (word+morpheme, last 4 digits of the id).
      (links[vkey] ??= []).push({ i: d.slice(8), e: en });
    }
    const doc = { version: 'BSB', book: name, bookNum: num, verses, nosp, excl, links };
    const json = JSON.stringify(doc);
    const file = join(outDir, `${String(num).padStart(2, '0')}-${OT_BOOKS[num - 1]}.json`);
    await writeFile(file, json);
    totalBytes += json.length;
    console.log(`  ${name}: ${Object.keys(verses).length} verses, ${(json.length / 1e3).toFixed(0)} KB`);
  }
  console.log(`Done (OT). ${wantedNums.length} book(s), ${(totalBytes / 1e6).toFixed(2)} MB → ${outDir}`);
}

const args = process.argv.slice(2);
const isOt = args.includes('--ot');
const nums = args.filter((a) => a !== '--ot').map(Number).filter((n) => n > 0);
if (isOt) {
  await buildOt(nums.length ? nums : OT_BOOKS.map((_, i) => i + 1));
} else {
  await buildNt(nums.length ? nums : NT_BOOKS.map((_, i) => i + 1));
}
