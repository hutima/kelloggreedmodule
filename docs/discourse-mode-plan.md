# Discourse Mode — Implementation Plan

Discourse mode is a **multi-verse / chapter / whole-book discourse-analysis
layer**: an interpretive outline of discourse *units* (not words), with
user-authored breaks, indentation, labels, and typed relations (ground,
inference, contrast, purpose, chiasm…), plus **non-authoritative** marker
hints derived from the source data. It is architecturally separate from the
sentence-level syntax visualizations — a different analysis layer, not
"Kellogg-Reed for a longer passage."

This document maps the existing architecture touchpoints and where Discourse
mode plugs in.

---

## 1. Current architecture touchpoints

### Diagram modes (visualizations)

- `src/domain/layout/modes/index.ts` — `DiagramMode` union +
  `DIAGRAM_MODES` list + `layoutForMode(mode, doc, hints, options)`.
  All current modes are *lenses over the one syntax graph*: each is a
  function `KrDocument → DiagramLayout` (geometric primitives).
  **Discourse will NOT go through `layoutForMode`** — a `DiscourseDocument`
  is not a `KrDocument`, and rendering is HTML/SVG-hybrid, not the shared
  primitive pipeline. `'discourse'` is added to the union so the one mode
  selector covers it, but `layoutForMode` never receives it (the canvas is
  swapped out before layout runs).
- `src/ui/components/DiagramCanvas.tsx` — the whole syntax canvas
  (mode select at ~line 892, toggles, pan/zoom SVG or HTML modes, verses
  strip, export). Discourse mode mounts a **separate**
  `src/ui/discourse/DiscourseCanvas.tsx` from `ResponsiveShell` instead,
  so none of the syntax-specific machinery (layout memos, gloss doc,
  contested previews, source compare) runs or shows in Discourse mode.
- `src/ui/shell/ResponsiveShell.tsx` — mounts `DiagramCanvas` for mobile and
  desktop. This is where the `diagramMode === 'discourse'` branch swaps in
  the discourse canvas.
- `src/ui/shell/VisualizationSwitcher.tsx` — small standalone mode selector
  (currently unused by the canvas); the discourse canvas header reuses it so
  the user can always switch back.

### Source loading (GNT)

- `src/io/gnt.ts` — `GNT_BOOKS` (all 27 books, `NN-name.xml`),
  `loadGntBook(book)` → `KrDocument[]` (one per sentence). Fetches the
  bundled copy first, then
  `raw.githubusercontent.com/biblicalhumanities/greek-new-testament/...`.
- `src/io/gnt-sblgnt.ts` — `loadSblgntBook(book)`; same 27-book list;
  fetches `Clear-Bible/macula-greek/main/SBLGNT/lowfat/NN-name.xml`
  (**verified reachable** — any of the 27 book files can be fetched; the
  service worker caches them in `gnt-books-v1`).
- `src/io/opentext-source.ts` — `loadOpenTextBook` (OpenText analysis,
  Nestle1904 surface).
- `src/io/lowfat.ts` — the Lowfat→KrDocument converter (dialects for
  Nestle1904 / SBLGNT / macula-hebrew). Sentence titles carry the verse
  range (`"Ephesians 5:3–5"`); document ids are stable per source file
  (`sblgnt_ephesians_42`).
- `src/io/sources.ts` — `SyntaxSourceId` (edition-aware ids), and private
  title-parsing helpers (`bookAndRange`, `overlaps`) used to match a
  passage range across sources.
- `src/io/passage.ts` — `combinePassage(docs)` merges checked sentences into
  one synthetic KrDocument. Discourse does **not** use it (a
  DiscourseDocument keeps the source sentence docs separate as
  `sourceDocIds`), but reuses the same title/verse parsing idioms.

The **discourse loader reuses `loadSblgntBook` / `loadGntBook` /
`loadOpenTextBook`** (and their caches) and then *filters the book's sentence
documents by ref range* — no new fetching layer, no flags added to the syntax
loader.

### What the loaded MACULA data actually exposes

Verified against `Clear-Bible/macula-greek/SBLGNT/lowfat/10-ephesians.xml`
and the converter in `src/io/lowfat.ts`:

| Data | Available? | Where in the app model |
| --- | --- | --- |
| book / chapter / verse refs | ✅ | token `morphology.extra.ref` (`"EPH 1:1!1"` SBLGNT; `"Phil.1.1!1"` osisId Nestle1904; `"Phlm.1.1"` + `wvi` OpenText); sentence title carries the verse range |
| sentence boundaries | ✅ | one `KrDocument` per Lowfat `<sentence>` |
| word-group / clause hierarchy | ✅ | converted syntax graph + preserved source constituency tree |
| token ids | ✅ | stable (`xml:id`/`n`-derived) per source file |
| morphology | ✅ | case/gender/number/person/tense/voice/mood |
| lemma | ✅ | `token.lemma` |
| gloss / english | ✅ | `token.gloss` |
| conjunctions / particles | ✅ | `token.pos` (`conjunction` / `particle`) + lemma |
| semantic roles (`frame`) | ⚠️ in the XML (`frame="A0:… A1:…"`), **not currently converted** — future hint source, not needed for v1 |
| participant referents (`referent`) | ⚠️ in the XML, **not currently converted** — same |
| paragraph boundaries | ⚠️ `<p>` exists in the XML but is not preserved through conversion — granularity 'paragraph' deferred |
| **discourse arcs / relations** | ❌ **MACULA Lowfat does NOT provide finalized discourse-arc relationships.** Particles, refs and clause boundaries are *evidence* for hints only. |

> **Warning (repeat for emphasis):** MACULA / SBLGNT Lowfat is a *syntax*
> corpus. It does **not** carry a discourse analysis. Everything
> "discourse-shaped" the app derives from it (possible markers, possible
> breaks, repeated lemmas) is a low/medium-confidence **suggestion**,
> surfaced as such, never silently committed. The user's authored structure
> is the authoritative overlay.

### State

- `src/state/store.ts` (~2000 lines) + `src/state/types.ts` — the single
  zustand editor store: `doc`/`baseDoc`/`corpus`, `appMode`
  (explore/edit/sermon), `editTier`, `diagramMode`, undo/redo stacks,
  `gntPassages` reading context, autosave.
- Discourse gets its **own zustand store** — `src/state/discourse.ts`
  (`useDiscourseStore`) — with its own loader state, document state, edit
  state, selection, undo/redo, and view toggles. This is the strongest
  possible guarantee that loading a discourse range can never clobber the
  syntax selection (and vice versa): the two live in different stores.
  Only `diagramMode: 'discourse'` (which *lens* is showing) stays in the
  editor store.

### Editing / patch persistence (design being reused)

- `src/domain/patch` — `diffDocuments(base, live)` / `applyPatch(base,
  patch)`; compact upsert·update·remove ops; `baseHash` + `sourceId`
  guards (`src/persistence/userData.ts` `applyStoredPatch`).
- Discourse mirrors this shape with its **own** diff/apply
  (`src/domain/discourse/patch.ts`, `DiscoursePatchSchema` in
  `src/domain/schema/discourse.ts`) over units/relations/markers — **never
  touching syntax patches**. Persistence key prefix `kr:discourse:` keyed
  by the generated base document id, which encodes
  `sourceId + book + range + granularity`; the patch carries
  `sourceId`, `editionId`, `book`, `range`, and a `baseHash` so a stale or
  cross-edition patch is skipped, never misapplied.
- Phrase/Block editing (`src/ui/editor/adapters.ts`, `block/`,
  `dispatch.ts`) is the UI *inspiration* for row selection, promote/demote
  and toolbar affordances — but discourse edit operations are separate pure
  helpers over `DiscourseDocument` (`src/domain/discourse/mutations.ts`),
  not `EditIntent`s against syntax nodes.

### Persistence keys (kept separate)

| Data | Key / store |
| --- | --- |
| syntax patches | `kr:patch:<passageId>` (localStorage) |
| sermon prep | `kr:sermon:<passageId>` |
| per-passage notes | `kr:notes:<passageId>` |
| imported variants | `kr:variants:<passageId>` |
| base assignments | IndexedDB `bases` store |
| session pointer | `kr:lastDoc` |
| **discourse patches (new)** | `kr:discourse:<discourseDocId>` |
| **discourse session pointer (new)** | `kr:lastDiscourse` (restores the last loaded range) |

---

## 2. Where Discourse mode plugs in

New modules (all additive; no existing module's behavior changes):

```
src/domain/schema/discourse.ts     Zod schemas: DiscourseDocument, DiscourseUnit,
                                   DiscourseRelation, DiscourseMarker,
                                   DiscourseSuggestion, DiscourseLayoutHints,
                                   DiscoursePatch
src/domain/discourse/build.ts      buildDiscourseDocumentFromKrDocuments /
                                   splitRangeIntoInitialUnits / refs utilities
src/domain/discourse/markers.ts    detectDiscourseMarkers + Greek hint lexicon
src/domain/discourse/mutations.ts  pure unit/relation edit ops (break, merge,
                                   indent, outdent, wrap, label, relations…)
src/domain/discourse/suggest.ts    suggestion heuristics (repeated lemma,
                                   γάρ chains, μέν/δέ, inclusio candidates…)
src/domain/discourse/patch.ts      diffDiscourseDocuments / applyDiscoursePatch
src/domain/discourse/export.ts     Markdown outline / relation table export
src/domain/discourse/index.ts      barrel
src/io/discourse-source.ts         loadDiscourseRange(sourceId, book, start,
                                   end, granularity) — reuses book loaders
src/state/discourse.ts             useDiscourseStore (loader + doc + edit +
                                   selection + undo/redo + persistence)
src/persistence/discourse.ts       kr:discourse:* patch records
src/ui/discourse/DiscourseCanvas.tsx        canvas replacement in discourse mode
src/ui/discourse/DiscourseView.tsx          read-only unit list + overlays
src/ui/discourse/DiscourseUnitBlock.tsx     one unit row (ref, text, chips)
src/ui/discourse/DiscourseRelationLayer.tsx SVG arcs/brackets between units
src/ui/discourse/DiscourseMarkerChip.tsx    marker chip with hint tooltip
src/ui/discourse/DiscourseRangeSelector.tsx dedicated range loader (left panel)
src/ui/discourse/DiscourseToolbar.tsx       edit toolbar (split/merge/indent…)
src/ui/discourse/DiscourseSuggestions.tsx   suggestions panel (PR 5)
```

Existing files touched (small, surgical):

- `src/domain/layout/modes/index.ts` — add `'discourse'` to `DiagramMode` +
  `DIAGRAM_MODES` (label "Discourse", description "Argument flow / discourse
  structure"). `layoutForMode` is never called with it.
- `src/ui/shell/ResponsiveShell.tsx` — `diagramMode === 'discourse'` renders
  `<DiscourseCanvas/>` instead of `<DiagramCanvas/>` (mobile + desktop).
- `src/ui/panels/LeftPanel.tsx` — in discourse mode the GNT tab renders
  `<DiscourseRangeSelector/>` instead of `<GntPicker/>`.
- `src/state/store.ts` — none of the syntax actions change. (`setDiagramMode`
  already persists nothing destructive; switching modes only changes which
  canvas mounts.)
- `src/io/index.ts`, `src/domain/schema/index.ts`, `src/persistence/index.ts`
  — barrel exports.

### Mode-switch independence (the key invariant)

- Syntax selection state (`doc`, `baseDoc`, `gntPassages`, `gntIndex`) lives
  in `useEditorStore` and is only written by syntax loaders/pickers.
- Discourse selection state (`sourceId`, `book`, `rangeStart`, `rangeEnd`,
  `granularity`, `baseDoc`, `doc`) lives in `useDiscourseStore` and is only
  written by `loadDiscourseRange` / discourse edits.
- `setDiagramMode('discourse')` and back only toggles which canvas + which
  left-panel picker is mounted. **Neither store is reloaded, reset, or
  overwritten on a mode switch** — the John 1:1 syntax passage and the
  Ephesians 5:3–33 discourse range coexist.

---

## 3. Source-derived vs user-authored

**Source-derived (provenance `given` / `inferred`, hint-grade only):**

- initial units at sentence (default) or verse granularity, grouped under
  chapter containers for multi-chapter ranges;
- unit refs + token id ranges;
- marker chips for discourse-relevant conjunctions/particles
  (γάρ, οὖν, διό, ἄρα, ἀλλά, πλήν, δέ, καί, ἵνα, ὅπως, ὅτι, εἰ, ἐάν, μέν…),
  each with a `suggestedFunction` and low/medium confidence;
- suggestions (possible breaks, γάρ ground chains, μέν/δέ pairs, repeated
  lemmas, possible inclusio) — **displayed as "possible / candidate", never
  auto-applied**.

**User-authored (provenance `manual`, the authoritative analysis):**

- breaks, merges, indentation/nesting, custom parent units ("Household
  code", "A", "B", "A′"), labels, notes;
- all discourse relations (ground, inference, contrast, purpose, result,
  elaboration, parallelism, inclusio, chiasm…);
- accepted suggestions (accepting converts a hint into an editable manual
  relation/marker assignment — the only path from hint to structure).

## 4. Stable identity

- Discourse document id: `disc_<sourceId>_<book>_<start>-<end>_<granularity>`
  (normalized refs) — deterministic, survives reloads.
- Source-derived unit ids derive from the stable sentence-doc ids
  (`du_<sentenceDocId>`, verse splits `du_<sentenceDocId>_v<verse>`,
  chapter containers `du_<book>_ch<c>`); token ids are the source token ids
  unchanged. They survive reloads as long as the source data is unchanged
  (same guarantee the syntax patch system already relies on).
- User-created units/relations get `nanoid`-based local ids stamped into the
  patch (`du_u_*`, `dr_*`), stable once created.
- Token **index is never identity**; ranges are `(refStart, refEnd)` +
  explicit `tokenIds`.

## 5. Known constraints

- **No discourse gold data**: MACULA provides no discourse arcs; OpenText's
  conjunction layer is clause-level syntax, not argument structure. All
  automation is heuristic and hint-grade.
- **Paragraph granularity deferred**: Lowfat `<p>` markers are not preserved
  through the current converter; initial granularities are `sentence`
  (default) and `verse`, with `clauseCluster` as a later refinement.
- **Whole-book scale**: Romans is ~500+ sentences; the discourse view renders
  text blocks (not word-level geometry) and collapses chapter containers by
  default on large ranges; virtualization only if profiling demands it.
- **Editing is desktop-first** like the existing Edit mode (`canEdit =
  vp.isDesktop`); Explore-mode reading works everywhere.
- **Hebrew**: the range selector ships GNT-first (SBLGNT default,
  Nestle1904 / OpenText selectable). The model is language-agnostic
  (`language` on the document), so WLC can join later without schema change.
- **License posture**: only already-bundled/likely-licensed sources are used
  (MACULA CC BY 4.0, SBLGNT CC BY 4.0, OpenText CC BY-SA 4.0). No new
  external discourse dataset dependency; the `DiscourseSuggestion.provenance`
  field keeps the door open for one later.

## 6. Staged delivery

1. **PR 0** — this document.
2. **PR 1** — schema + pure model layer + tests (no UI).
3. **PR 2** — separate discourse range loader + `useDiscourseStore` branch.
4. **PR 3** — `'discourse'` DiagramMode + read-only renderer (units, arcs,
   chips, toggles, chiasm labels).
5. **PR 4** — edit mode: breaks, merge, indent/outdent, labels, custom
   parents, relations; discourse patches; undo/redo; reset.
6. **PR 5** — suggestions panel (marker-driven, accept-to-edit).
7. **PR 6** — whole-book performance, outline navigation, exports
   (JSON / Markdown / relation table).
8. **PR 7** — docs, UI polish, regression suite.
