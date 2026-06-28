# CLAUDE.md — Domain & Linguistic Reference

This document is the canonical reference for the **linguistic model** and
**data design** behind the Kellogg-Reed Diagrammer. Read it before changing the
schema, the inference engine, the layout engine, or the renderer. (For build/run
instructions and the high-level architecture, see `README.md`.)

---

## 1. Linguistic philosophy

The application produces **hybrid Kellogg-Reed diagrams** for **English** and
**Koine / Biblical Greek**, treated as equal first-class languages.

The guiding principle is a strict separation of **three concerns**, which the
codebase mirrors module-for-module:

| Concern | Question it answers | Where it lives |
| --- | --- | --- |
| 1. Surface word order | *How was the sentence written?* | `Token[]` (`src/domain/schema/token.ts`) |
| 2. Syntactic relationships | *How do the words relate?* | `SyntaxModel` (`src/domain/schema/syntax.ts`) |
| 3. Diagram layout | *Where is each piece drawn?* | layout engine + `LayoutHints` (`src/domain/layout`, `schema/layout.ts`) |

**The renderer must never infer structure from linear token order.** A token's
`index` records *only* where the word appears in the string. Syntactic nodes
reference tokens by id, may reference *zero* tokens (implied/elided element) or
*several non-adjacent* tokens (discontinuous constituent). This is what lets the
model represent Greek faithfully.

### What the model deliberately supports

- **Free word order** — layout follows relationships, not sequence (see the
  `Ἐν ἀρχῇ ἦν ὁ λόγος` sample: the fronted PP still lays out beneath the verb).
- **Implied subjects** — a subject node with no tokens and `implied: true`
  (Greek pro-drop, English imperatives).
- **Omitted copula** — a clause may have a predicate complement with no verb
  token; the predicate nucleus can itself be implied.
- **Predicate nominatives / adjectives** with no English ordering assumption —
  both arguments of a copula can be nominative; the *role* distinguishes them.
- **Participles** functioning adjectivally, adverbially, substantivally, or
  periphrastically — captured by `pos: 'participle'` plus the node `role`.
- **Genitives** with multiple semantic functions — `role: 'genitive'` plus a
  free-text `notes`/connector `label` (possessive, descriptive, partitive…).
- **Discourse particles** — `role: 'particle'` (δέ, γάρ, μέν, οὖν …).
- **Embedded, subordinate, and nested clauses** — clause-kind nodes nested to
  any depth.
- **Discontinuous constituents** — a node whose `tokenIds` are non-contiguous
  (`isDiscontinuous()` detects them).
- **Coordination** — a `coordinator` node with `conjunct` relations.

### Hybrid conventions retained from schoolroom Kellogg-Reed

- main clause baseline; subject/predicate divider (full vertical line);
- direct objects & complements on the main line (with the appropriate
  separator — vertical for objects, back-slanted for predicate nominatives);
- modifiers slanted beneath their heads;
- prepositional phrases attached beneath the governing word;
- subordinate clauses attached beneath the governing element;
- conjunctions shown between coordinated elements.

---

## 2. Supported parts of speech

`PartOfSpeech` (`src/domain/schema/primitives.ts`) is a **superset** covering
both languages. It is additive — adding a value must never break old documents.

```
noun · propernoun · pronoun · verb · participle · infinitive · adjective ·
adverb · article · preposition · conjunction · particle · interjection ·
numeral · determiner · unknown
```

`participle` and `infinitive` are listed as distinct from `verb` because they
diagram differently even though they are verb forms.

---

## 3. Greek grammatical features

Morphology (`MorphologySchema`) is a bundle of **optional** fields, so partial
parses and either language populate only what applies.

- **case** — nominative, genitive, dative, accusative, vocative
- **gender** — masculine, feminine, neuter, common
- **number** — singular, dual, plural
- **person** — first, second, third
- **tense** — present, imperfect, future, aorist, perfect, pluperfect (+ `past`)
- **voice** — active, middle, passive, middlepassive
- **mood** — indicative, subjunctive, optative, imperative, infinitive, participle
- **degree** — positive, comparative, superlative
- **extra** — free-form `Record<string,string>` for anything not yet modelled

The inference engine uses **agreement** (case/gender/number) — not adjacency —
to attach Greek articles to their nouns, which is robust to free word order.

---

## 4. English grammatical features

English uses the subset that applies: `pos`, `person`, `number`, `tense`,
`degree`. Closed classes (articles, prepositions, coordinators, subordinators,
copulas, pronouns) drive the heuristic rules; see `src/domain/inference/lexicon.ts`.
English inference leans on position only as a *heuristic* (and every result is
a provisional, editable inference — never a hard rule).

---

## 5. Syntax relationships

Relations (`SyntacticRole`) are typed, directed edges `head → dependent`. Broad
and additive; the layout engine degrades gracefully for unknown values.

**Clause structure:** `clause`, `subject`, `predicate`, `copula`
**Verbal arguments / complements:** `directObject`, `indirectObject`,
`predicateNominative`, `predicateAdjective`, `objectComplement`,
`dativeComplement`, `genitiveComplement`, `agent`
**Modification:** `adjectival`, `adverbial`, `determiner`, `genitive`,
`apposition`, `prepositionalPhrase`, `prepositionObject`
**Discourse / connectives:** `conjunction`, `coordinator`, `conjunct`,
`particle`, `vocative`, `interjection`
**Catch-all:** `adjunct`, `unknown`

Layout treatment: `subject` and `predicate` define the baseline; the
`BASELINE_COMPLEMENTS` set renders on the main line; everything else hangs
beneath its head (clauses with a dotted stem, prepositional structures with a
stem, other modifiers with a slant).

---

## 6. Clause types

When `kind === 'clause'`, `clauseType` is one of:

```
independent · relative · adverbial · complement · infinitival ·
participial · coordinate · unknown
```

A clause node may nest inside any other node (e.g. a relative clause attached
`adjectival`-ly to a noun, or a complement clause as a `directObject`).

---

## 7. JSON schema

A document (`KrDocument`) is the unit of persistence, import, and export. All
shapes are defined and validated with **Zod** in `src/domain/schema/`.

```jsonc
{
  "schemaVersion": 1,
  "id": "doc_…",
  "title": "The Word became flesh",
  "language": "en",            // "en" | "grc"
  "text": "The Word became flesh.",
  "notes": "",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "layoutHints": {              // optional per-node overrides, keyed by node id
    "n_word": { "offsetX": 0, "offsetY": 0, "collapsed": false }
  },
  "tokens": [
    {
      "id": "t1", "index": 0, "surface": "The",
      "lemma": "the", "language": "en", "pos": "article",
      "gloss": "the",
      "morphology": { "case": "nominative", "gender": "masculine", "number": "singular" },
      "provenance": { "source": "given", "confidence": "high" }
    }
  ],
  "syntax": {
    "rootId": "n_root",
    "nodes": [
      { "id": "n_root", "kind": "clause", "clauseType": "independent", "tokenIds": [] },
      { "id": "n_word", "kind": "word", "role": "subject", "tokenIds": ["t2"] },
      { "id": "n_impl", "kind": "word", "role": "subject", "tokenIds": [], "implied": true, "label": "(he)" }
    ],
    "relations": [
      {
        "id": "r1", "type": "subject",
        "headId": "n_root", "dependentId": "n_word",
        "label": "optional connector text",
        "provenance": { "source": "given", "confidence": "high" }
      }
    ]
  }
}
```

### Provenance (every assertion is traceable)

```jsonc
{ "source": "inferred", "confidence": "high",
  "reason": "Finite third singular verb without explicit subject." }
```

- `source` — `given` | `inferred` | `confirmed` | `manual`
- `confidence` — `high` | `medium` | `low`
- `reason` — human-readable justification

Inferences are produced by the engine as **declarative ops** (`addNode`,
`addRelation`, `updateNode`, `updateToken`). Accepting one runs its ops and
flips affected entities from `inferred` to `confirmed`; rejecting one simply
discards it (the document is never touched). `addNode`/`addRelation` are
**idempotent** (upsert by id), so inferences can be accepted in any order and
any subset without producing dangling references.

---

## 8. Rendering conventions

The layout engine (`src/domain/layout/engine.ts`) emits **pure geometric
primitives** (`LineElement`, `TextElement`); the renderer (`src/domain/render`)
and the on-screen canvas only draw those primitives. The renderer therefore
cannot see tokens or word order — structure is fully decided by layout.

| Element | Convention |
| --- | --- |
| Main baseline | solid horizontal line carrying subject + verb + complements |
| Subject \| predicate divider | solid vertical line crossing the baseline |
| Direct/indirect object | solid vertical tick standing *on* the baseline |
| Predicate nominative/adjective | line slanting back toward the verb |
| Modifier (adjective, adverb, article, genitive) | solid slant beneath the head |
| Prepositional phrase | stem beneath the head; object on its own baseline below |
| Subordinate / relative clause | dotted stem to a fully laid-out sub-baseline |
| Coordination | coordinator node joining `conjunct`s |
| Implied / elided element | muted italic label (e.g. `(he)`), drawn but greyed |
| Connector label | small italic text; suppressed when it would merely repeat the dependent word |

Layout hints (`offsetX`/`offsetY`/`collapsed`/`slantAngle`) adjust the picture
only — they never change the syntax model.

### Fonts

Polytonic Greek must always be legible. The font stack (`src/domain/render/theme.ts`
and the CSS `--greek` variable) prefers Unicode-complete serif faces:
`Gentium Plus`, `Cardo`, `New Athena Unicode`, `GFS Didot`, `Palatino Linotype`,
falling back to `Times New Roman`, `DejaVu Serif`, `serif`. Text width
estimation (`measure.ts`) treats combining diacritical marks as zero-width so
accented Greek does not over-measure.

---

## 9. Where things live (quick map)

```
src/domain/schema/      Zod schemas — single source of truth for data shapes
src/domain/model/       pure helpers: ids, queries, immutable mutations, tokenize
src/domain/inference/   provisional inference engine (rules/, apply, engine)
src/domain/layout/      syntax model → geometry (never reads word order)
src/domain/render/      geometry → SVG string + shared theme
src/state/              zustand editor store, undo/redo, autosave
src/persistence/        IndexedDB (idb) with localStorage fallback
src/io/                 JSON / SVG / PNG / print import & export
src/fixtures/           validated sample documents
src/ui/                 three-panel React app
```

When extending: add schema values first, then teach the inference rules
(register in `inference/rules/index.ts`), then the layout engine if a new role
needs special geometry. Keep the three concerns separate.
