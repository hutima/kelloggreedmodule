# Kellogg-Reed Diagrammer

A Progressive Web App for creating, editing, and exporting **hybrid
Kellogg-Reed sentence diagrams** for both **English** and **Koine / Biblical
Greek**.

It is an installable, offline-capable PWA with local persistence, a clean
domain-driven architecture, and SVG-based rendering. It treats English and
Greek as equal first-class languages and never forces Greek syntax into rigid
English word-order patterns.

> The linguistic model, JSON schema, and rendering conventions are documented
> in detail in [`CLAUDE.md`](./CLAUDE.md).

---

## Features

- **Three working modes**
  - **Parsed** — paste a complete parse (JSON or the structured Parse editor)
    and render it.
  - **Assisted** — supply partial input and let the **inference engine** propose
    structure. Every inference is provisional, editable, and removable, and
    carries `source` / `confidence` / `reason` metadata. Accept or reject each
    one (or all).
  - **Manual** — build a diagram from scratch, node by node, no parse required.
- **Hybrid Kellogg-Reed renderer (SVG)** — baseline, subject/predicate divider,
  objects & complements, slanted modifiers, prepositional phrases, coordination,
  subordinate & nested clauses, implied elements, and free Greek word order.
- **Three-panel editor** — sources (text · tokens · parse · JSON) · diagram
  canvas · inspector (grammar · relations · notes · layout hints · inferences).
- **Separation of concerns** — surface word order, syntactic relationships, and
  diagram layout are independent. The renderer never derives structure from
  token order, so discontinuous constituents and free word order just work.
- **Persistence** — autosave to IndexedDB (with a localStorage fallback) and a
  recent-documents list.
- **Import / export** — JSON (round-trips losslessly, schema-validated), SVG,
  PNG, and a print-friendly view.
- **Offline & installable** — service worker precaching via `vite-plugin-pwa`.
- **Polytonic Greek** — a Unicode-complete serif font stack and
  diacritic-aware text measurement.

---

## Quick start

Requirements: **Node 18+** (developed on Node 22) and npm.

```bash
npm install        # install dependencies
npm run dev        # start the dev server (Vite) → http://localhost:5173
```

Then open the app and pick a sample from the **Samples** menu, or type a
sentence in the **Text** tab and click **Tokenize**.

### Other scripts

```bash
npm run build      # type-check (tsc -b) and build the production PWA into dist/
npm run preview    # preview the production build locally
npm test           # run the unit test suite (Vitest)
npm run test:watch # watch mode
npm run coverage   # coverage report
npm run lint       # ESLint
npm run typecheck  # type-check only
```

Sample diagrams can be regenerated as standalone SVGs with:

```bash
npx vite-node scripts/render-samples.mts
```

---

## Application modes in practice

1. **Parsed input** — Paste JSON into the **JSON** tab and *Apply*, or build the
   structure explicitly in the **Parse** tab, then read the rendered diagram.
2. **Assisted parse** — Enter text, **Tokenize**, switch the mode toggle to
   **Assisted**. The **Inferences** tab fills with suggestions; accept/reject
   them individually or in bulk, then refine by hand.
3. **Manual diagram** — Add tokens (or none), then create nodes and relations in
   the **Parse** tab and tune positions with **Layout** hints.

Selecting any word, line, token, or relation opens it in the **Inspector** for
editing (part of speech, full morphology, role, clause type, notes, …).

---

## Architecture

Clean, domain-driven, and layered so each piece can be edited or extended in
isolation. Dependencies point inward toward the domain.

```
src/
  domain/
    schema/        Zod schemas — the single source of truth for all data shapes
    model/         pure helpers: id minting, graph queries, immutable mutations, tokenizer
    inference/     provisional inference engine (pluggable rules/, declarative ops, apply)
    layout/        syntax model → pure diagram geometry (never reads word order)
    render/        geometry → SVG string, shared visual theme
  state/           zustand editor store: selection, undo/redo, autosave
  persistence/     IndexedDB via idb, with a localStorage fallback; recent docs
  io/              JSON / SVG / PNG / print import & export
  fixtures/        bundled, schema-validated sample documents
  ui/              three-panel React application (components + panels + styles)
tests/             schema, inference, layout, render, io, and store unit tests
scripts/           icon generation + sample SVG rendering
```

### The central idea: three separated concerns

| Concern | Module | Never does |
| --- | --- | --- |
| Surface **word order** | `domain/schema/token.ts` | imply structure |
| Syntactic **relationships** | `domain/schema/syntax.ts` | carry pixels |
| Diagram **layout** | `domain/layout` + `schema/layout.ts` | re-derive syntax |

This is why the diagrammer renders Greek correctly: a fronted prepositional
phrase, an implied subject, or a discontinuous constituent is described by its
*relationships*, and the layout engine places it accordingly — independent of
where the words physically appear in the sentence.

### Extending the app

- **New grammatical feature** → add the value to the relevant Zod enum in
  `domain/schema/` first. Documents remain backward-compatible.
- **New inference** → write an `InferenceRule` and register it in
  `domain/inference/rules/index.ts`. Nothing else changes.
- **New diagram convention** → adjust the layout engine; the renderer follows
  automatically because it only draws primitives.

See [`CLAUDE.md`](./CLAUDE.md) for the full linguistic and schema reference.

---

## Sample data

The bundled samples (Samples menu, and `src/fixtures/*.json`) include:

- *The quick brown fox jumps over the lazy dog.* — modifiers + prepositional phrase
- *The Word became flesh.* — linking verb + predicate nominative
- *Ἐν ἀρχῇ ἦν ὁ λόγος.* — fronted PP, copula before subject (word-order independence)
- *Καὶ ὁ λόγος σὰρξ ἐγένετο.* — predicate nominative distinguished by syntax, not order
- *ὃ ἦν ἀπ᾽ ἀρχῆς, ὃ ἀκηκόαμεν, ὃ ἑωράκαμεν τοῖς ὀφθαλμοῖς ἡμῶν.* — three
  embedded relative clauses, implied subjects, dative of means, adnominal genitive

---

## Tech stack

React · TypeScript · Vite · `vite-plugin-pwa` (Workbox) · Zustand · Zod ·
`idb` · Vitest. SVG-based rendering. No backend — everything runs and persists
in the browser.

## License

MIT
