#!/usr/bin/env node
/**
 * Download Nestle1904 Lowfat GNT syntax trees into public/gnt/ for full offline
 * bundling. Books are otherwise fetched on demand (and cached by the service
 * worker) — run this only if you want the entire GNT (~80 MB) shipped with the
 * app.
 *
 *   node scripts/fetch-gnt.mjs            # all 27 books
 *   node scripts/fetch-gnt.mjs 11 18 26   # only the given book numbers
 *
 * Source: biblicalhumanities / Clear-Bible macula-greek (CC BY-SA 4.0).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE =
  'https://raw.githubusercontent.com/biblicalhumanities/greek-new-testament/master/syntax-trees/nestle1904-lowfat/xml/';

const FILES = [
  '01-matthew', '02-mark', '03-luke', '04-john', '05-acts', '06-romans',
  '07-1corinthians', '08-2corinthians', '09-galatians', '10-ephesians',
  '11-philippians', '12-colossians', '13-1thessalonians', '14-2thessalonians',
  '15-1timothy', '16-2timothy', '17-titus', '18-philemon', '19-hebrews',
  '20-james', '21-1peter', '22-2peter', '23-1john', '24-2john', '25-3john',
  '26-jude', '27-revelation',
].map((f) => `${f}.xml`);

const only = process.argv.slice(2).map(Number);
const wanted = only.length
  ? FILES.filter((f) => only.includes(Number(f.split('-')[0])))
  : FILES;

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'gnt');
await mkdir(outDir, { recursive: true });

for (const file of wanted) {
  process.stdout.write(`${file} … `);
  const res = await fetch(BASE + file);
  if (!res.ok) {
    console.log(`FAILED (${res.status})`);
    continue;
  }
  const xml = await res.text();
  await writeFile(join(outDir, file), xml);
  console.log(`${(xml.length / 1e6).toFixed(2)} MB`);
}
console.log('Done. Add public/gnt to the build to bundle these books.');
