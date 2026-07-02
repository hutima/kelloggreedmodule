# Scripture Diagrammer

A Progressive Web App for exploring, editing, and exporting **sentence diagrams**
of the Bible across several visualizations — **Kellogg-Reed**, **Phrase / Block**,
**Dependency**, and **Morphology / Word Details** — for **English**, **Koine /
Biblical Greek**, and **Biblical Hebrew**, treated as equal first-class languages.

It is an installable, offline-capable PWA with local persistence, a clean
domain-driven architecture, and SVG-based rendering. It never forces Greek or
Hebrew syntax into rigid English word-order patterns: structure follows the
*relationships*, not the order of the words.

> The linguistic model, JSON schema, and rendering conventions are documented in
> detail in [`CLAUDE.md`](./CLAUDE.md).

---

## Three user-facing modes (one shared model)

All experiences are lenses over the **same** document model (tokens · syntax
nodes · relations · layout hints · provenance):

- **Explore** — the default, especially on mobile. Read the original text, tap a
  word to see its lemma / parsing / gloss / role, and switch visualizations
  (Kellogg-Reed · Phrase/Block · Dependency · Morphology). Optional English
  alignment and an **English-gloss toggle** that swaps the displayed words to
  their glosses while keeping the Greek/Hebrew parse.
- **Edit** (**desktop-only**) — a tier-aware, mode-aware editing system. A
  **Basic / Advanced** toggle drives each visualization's own editing behaviour:
  Basic is visual-first (chips, taps, drag, visual word→word linking, row
  promote/demote in Phrase/Block); Advanced is technical (full role lists,
  morphology, manual relation building). Every semantic edit flows to the shared
  graph and shows in all views; layout tweaks stay view-local. Hidden on phones
  and tablets unless desktop mode is forced.
- **Sermon Prep** — notes, highlights, observations, and an outline anchored to
  stable ids, kept separate from syntax. A persistent drawer on desktop, a light
  sheet on mobile.

User edits are stored as **compact diffs against the gold-standard base** (never
duplicated documents) and are exportable, importable, and resettable.

## Contested syntax & alternate readings

Where a passage carries a debated syntactic decision or a textual variant, the
base parse (the loaded edition's) remains the default, and **alternate readings are encoded
as overlays** — using the smallest representation that captures the difference
(review · semantic · syntax · punctuation · textual). A discreet badge appears
only on passages with contested data; a panel explains the issue in neutral
language, you can **preview** an alternate (never saved) or **compare it
side-by-side** with linked scrolling and difference highlighting, and on desktop
**adopt** a structural alternate as your custom parse. See `src/data/contestedSyntax.ts`
and `src/domain/contested/`.

## Greek data sources

The Greek NT pipeline is rebased around **SBLGNT Lowfat / MACULA Greek** as
the primary/default Greek edition:

- **SBLGNT Lowfat** (MACULA Greek, Clear-Bible — CC BY 4.0; SBLGNT text ©
  SBL, CC BY 4.0) is the **default** Greek edition, with Philippians bundled
  for offline first-run.
- **Nestle1904 Lowfat** (biblicalhumanities, CC BY-SA 4.0) remains fully
  available as the **legacy/alternate** edition — saved documents and patches
  are edition-scoped and never silently cross editions.
- **OpenText.org** remains a **secondary/alternate** syntax source.
- **Hebrew WLC Lowfat** (macula-hebrew) is unchanged.
- The **BSB English alignment** (Clear-Bible) is keyed to an SBLGNT base, so
  SBLGNT passages align **directly by position** (Strong's-verified);
  Nestle1904 keeps the Strong's/lemma matching with positional fallback, and
  every link records which method matched it.
- The rebase is partly infrastructure for better **Greek syntax /
  Kellogg-Reed display**: nuanced accusative roles (an accusative under a
  passive verb is a neutral "accusative modifier", not a claimed direct
  object), articular/substantival prepositional phrases rooted on their
  article, and honest provenance ("Analysis:" lines disclose interpretive
  conversions and uncertainty). The active source is always visibly labeled;
  the Constituency Tree renders the **source `<wg>` hierarchy** when
  available and says when it is reconstructed instead.

The staged plan, phase status, decisions, and the Mark 5:26 core regression
are tracked in
[`docs/sblgnt-kellogg-reed-plan.md`](./docs/sblgnt-kellogg-reed-plan.md).

## Features

- **Four visualizations over one graph** — Kellogg-Reed (formal SVG diagram),
  Phrase/Block (interactive outline / workbench), Dependency (head→dependent
  arcs), and Morphology / Word Details (forms + agreement arcs).
- **Tier-aware editing** — per-mode Basic and Advanced edit experiences, a
  mode-aware "How to edit" help, visual linking, and a relationship quick-picker.
- **Gold-standard data** — GNT (SBLGNT LowFat, Clear-Bible MACULA Greek
  CC BY 4.0 — the default edition — plus Nestle1904 LowFat,
  biblicalhumanities, as legacy/alternate) and OT (WLC LowFat,
  macula-hebrew), fetched on demand and cached; Philippians is bundled for
  offline/first-run in both Greek editions. Hand-tagged sample documents are
  bundled too.
- **Strong's lexicon** — the whole Greek + Hebrew Strong's dictionary (Open
  Scriptures, public-domain Strong's 1890), bundled under `public/lexicon/` and
  loaded on demand for the add-a-word lemma search.
- **Legacy inference engine** — Parsed / Assisted / Manual working modes; every
  inference carries `source` / `confidence` / `reason` and is accept/rejectable.
- **Separation of concerns** — surface word order, syntactic relationships, and
  diagram layout are independent; the renderer never derives structure from token
  order, so discontinuous constituents and free word order just work.
- **Persistence** — autosave to IndexedDB (localStorage fallback); per-passage
  patch/diff, sermon prep, and notes kept in separate keys.
- **Import / export** — JSON (round-trips losslessly, schema-validated), SVG,
  PNG, and a print-friendly view.
- **Offline & installable** — `vite-plugin-pwa` (`injectManifest`) with a
  race-condition-safe update flow.
- **Polytonic Greek & Hebrew** — Unicode-complete font stacks and
  diacritic-aware text measurement.

---

## Quick start

Requirements: **Node 18+** (developed on Node 22) and npm.

```bash
npm install        # install dependencies
npm run dev        # start the dev server (Vite) → http://localhost:5173
```

Open the app, pick a passage from **Sources** (GNT / OT) or a bundled **sample**,
or type a sentence in the **Text** tab and **Tokenize**.

### Scripts

```bash
npm run build            # type-check (tsc -b) and build the production PWA into dist/
npm run preview          # preview the production build locally
npm test                 # run the unit test suite (Vitest)
npm run lint             # ESLint
npm run typecheck        # type-check only

# Developer utilities for the contested-syntax registry:
npm run dump-syntax -- "Php 1:1"   # print a passage's real token/node/relation ids
npm run contested:check            # validate the registry against the real base data
```

Sample diagrams can be regenerated as standalone SVGs with
`npx vite-node scripts/render-samples.mts`.

---

## Architecture

Clean, domain-driven, and layered so each piece can be edited or extended in
isolation. Dependencies point inward toward the domain.

```
src/
  domain/
    schema/        Zod schemas — the single source of truth for all data shapes
                   (token · syntax · layout · sermon · patch · contested)
    model/         pure helpers: ids, graph queries, immutable mutations, tokenize, outline
    inference/     provisional inference engine (pluggable rules/, declarative ops, apply)
    layout/        syntax model → pure diagram geometry, per visualization mode
    render/        geometry → SVG string, shared visual theme
    patch/         PatchManager: base + diff ⇄ edited document (pure, idempotent)
    sermon/        pure sermon-prep mutations (notes / highlights / outline)
    contested/     alternate-reading overlays: registry access, apply, diff
  data/            curated contested-syntax registry (authored against real ids)
  state/           zustand editor store: selection, tiers, undo/redo, autosave
  persistence/     IndexedDB via idb (+ localStorage fallback); patches, sermon, notes
  io/              GNT / OT loaders, JSON / SVG / PNG / print import & export
  fixtures/        bundled, schema-validated sample documents
  ui/
    shell/         responsive shell, mode / visualization switchers
    editor/        tier-aware editing core (adapters, dispatch, toolbar, modals)
    contested/     badge, panel/sheet/drawer, side-by-side comparison, diff highlighting
    sermon/        sermon-prep drawer / mobile sheet / highlight toolbar
    components/    diagram canvas + the HTML diagram views
tests/             schema, inference, layout, render, io, store, adapter, contested tests
scripts/           icon generation, sample rendering, dump-syntax, contested:check
```

### The central idea: three separated concerns

| Concern | Module | Never does |
| --- | --- | --- |
| Surface **word order** | `domain/schema/token.ts` | imply structure |
| Syntactic **relationships** | `domain/schema/syntax.ts` | carry pixels |
| Diagram **layout** | `domain/layout` + `schema/layout.ts` | re-derive syntax |

This is why the diagrammer renders Greek and Hebrew correctly: a fronted
prepositional phrase, an implied subject, or a discontinuous constituent is
described by its *relationships*, and the layout engine places it accordingly —
independent of where the words physically appear.

### Extending the app

- **New grammatical feature** → add the value to the relevant Zod enum in
  `domain/schema/` first. Documents remain backward-compatible.
- **New inference** → write an `InferenceRule` and register it in
  `domain/inference/rules/index.ts`.
- **New diagram convention** → adjust the layout engine; the renderer follows
  because it only draws primitives.
- **New contested reading** → dump the passage's real ids
  (`npm run dump-syntax -- "<ref>"`), add the issue/alternate to
  `src/data/contestedSyntax.ts`, and validate with `npm run contested:check`.

See [`CLAUDE.md`](./CLAUDE.md) for the full linguistic and schema reference.

---

## Tech stack

React · TypeScript · Vite · `vite-plugin-pwa` (Workbox) · Zustand · Zod ·
`idb` · Vitest. SVG-based rendering. No backend — everything runs and persists
in the browser.

## License

MIT
