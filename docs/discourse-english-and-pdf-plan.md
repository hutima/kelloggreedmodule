# Discourse English (KJV/ASV), plaintext “New”, and syntax PDF export — plan

This note records the chosen paths and source-data / licensing decisions for the
staged enhancement after PR196/PR197 (Discourse mode). It preserves the PR196
architectural boundary: Discourse mode keeps its own document model, store,
persistence namespace, range loader, canvas, edit model, and exports; it never
mutates sentence-level syntax `KrDocument`s and is never routed through
`layoutForMode`.

## Feature 1 — KJV & ASV as English-only Discourse sources

English Bible sources already exist (PR197): `src/io/english-bible.ts` builds a
normalized `EnglishBibleBook` from the **bundled** BSB parallel corpus. KJV/ASV
are added as **remote, English-only** sources that fetch on demand and cache.

**Where the code lives**

- `src/io/english-bible-remote.ts` (new) — the remote manifest, the 66-book
  canonical list, an in-memory promise cache (same style as `parallel.ts` /
  `gnt.ts`), and pure normalizers that turn each upstream shape into an
  `EnglishBibleBook` with **plain English tokens only** (no lemma, morphology,
  Strong’s, or original-language alignment — `alignmentMethod` is always
  `'none'`).
- `src/io/english-bible.ts` (extended) — `EnglishBibleSourceId` gains
  `'english-kjv' | 'english-asv'`; `ENGLISH_BIBLE_SOURCES` gains the two remote
  entries; `englishBibleBooksFor` / `loadEnglishBibleBook` delegate to the remote
  loader for those ids. Nothing else changes, so `discourse-source.ts` and the
  range selector pick them up automatically (they already spread
  `ENGLISH_BIBLE_SOURCES`).

**Data sources & licensing (verified via raw.githubusercontent.com)**

| Source | Repo | Shape | License note |
| --- | --- | --- | --- |
| KJV | `aruljohn/Bible-kjv` | **per-book** JSON `{book, chapters:[{chapter, verses:[{verse,text}]}]}` (e.g. `John.json`, `1Samuel.json`) | KJV (1611/1769) is **public domain** (outside the UK); the repo is a plain-text data dump. |
| ASV | `scrollmapper/bible_databases` | **whole-Bible** JSON `formats/json/ASV.json` `{translation, books:[{name, chapters:[{chapter, verses:[{verse,text}]}]}]}` | ASV (1901) is **public domain**; the repo is **MIT** licensed. Fetched once, cached, then sliced per book. |

Only a **manifest + URL template + adapter** ship in this app; no Bible text is
copied into the repo. Book identity is matched by **canonical index** (both
upstreams are in standard 66-book Protestant order) so the Roman-numeral book
names in the ASV source (`I Samuel`, `Revelation of John`) don’t need string
matching. Remote failures surface a readable error and never corrupt discourse
or syntax state (the loader throws; the store/selector show the message).

No Greek/Hebrew tags, morphology, lemmas, Strong’s, or MACULA discourse-marker
hints are produced for KJV/ASV. The conservative **English** marker heuristic
(`detectEnglishDiscourseMarkers`, already in `markers.ts`) still applies, exactly
as it does for BSB — it is a deliberately-implemented English lexicon, not a
pretence that “for/therefore/but” equals MACULA tagging.

## Feature 2 — Discourse “New” / plaintext loader

- `src/domain/discourse/plaintext.ts` (new) — `buildDiscourseDocumentFromPlainText`
  tokenizes pasted text deterministically (whitespace words, punctuation kept),
  splits it into **sentence** leaf units (`.`/`?`/`!`, Greek `;`/`·`, Hebrew sof
  pasuq `׃`, and blank-line paragraph breaks), and returns a `DiscourseDocument`
  with `sourceId: 'custom-plaintext'`. Ids derive from a djb2 hash of the
  normalized text + sentence/word index, so re-loading the same text yields the
  same ids + baseHash (patches survive). **No markers, suggestions,
  original-language links, lemmas, morphology, or Strong’s** are invented; no LLM
  prompt is built and no syntax `KrDocument` is created.
- `src/state/discourse.ts` — a `loadPlainText(text, title?)` action builds the
  base, applies any stored patch, and publishes it exactly like a range load.
- `src/ui/discourse/DiscoursePlaintextPicker.tsx` (new) + a “New text” tab in the
  discourse left panel (`LeftPanel.tsx`) — a textarea, optional title, and a
  “Load text” button, kept visually subordinate to the range loader.

Patches persist in the existing `kr:discourse:*` namespace keyed by the plaintext
doc id, so plaintext edits are isolated from Bible-source edits and Reset affects
only that document.

## Feature 3 — PDF export for syntax diagrams

- `src/io/export.ts` — `buildPrintableSvgHtml(svg, meta)` wraps the **existing**
  syntax SVG (same layout + render pipeline, so it honours diagram mode, vertical
  scale, tree orientation, RTL, grammar colour, sermon highlights, and contested
  washes) in a self-contained print-styled HTML document (title, passage label,
  generated date, `@media print` CSS). `printDocumentPdf(...)` builds the SVG and
  opens it through the existing `printHtmlDocument` helper (“choose Save as PDF”).
- `src/ui/components/ExportModal.tsx` — adds a **PDF / Print** format alongside
  PNG, SVG, and JSON. PNG/SVG/JSON behaviour is unchanged; a popup/print failure
  shows a user-visible error. This is the **syntax** export modal only; Discourse
  keeps its own separate print-to-PDF outline export.

## Verification

Each phase runs `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`.
Unit tests mock `fetch` (no live network) and assert exact verse-range trimming,
cross-chapter loading, fetch-failure handling, provenance/licence metadata,
source visibility (Discourse-only), plaintext determinism, and the PDF HTML
wrapper.
