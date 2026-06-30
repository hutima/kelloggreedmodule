# Feasibility: better Greek tagging for typed text (Strong's + a morphology source)

*Question raised:* can we get better Greek auto-tagging for the typed **New**
source by bundling Strong's (gender + base lemma) together with the "morphology
generator" from [`hutima/duff_study_tool`](https://github.com/hutima/duff_study_tool)?

Short answer: **the `duff_study_tool` path is not viable as stated, but the goal
is very achievable** — most of what's needed is *already bundled in this repo*
and just isn't being used on typed text yet.

---

## 1. Why typed Greek tags poorly today

The GNT and OpenText sources are richly tagged because their **morphology comes
from the source data** (case/gender/number/tense/… per word). A typed sentence
in the **New** source has none of that:

- `tokenize(text, 'grc')` produces tokens with a **surface form only** — no
  lemma, no case, no gender.
- The inference engine's Greek rules key on **morphological agreement** (it finds
  the subject by *nominative case*, attaches an article to its noun by
  case/gender/number agreement, etc. — see `CLAUDE.md` §3 and
  `src/domain/inference/rules/`). With no morphology on open-class words, those
  rules have nothing to work with.
- The lexicon (`src/domain/inference/lexicon.ts`) only knows **closed classes**
  (articles, prepositions, conjunctions, copulas, pronouns) by surface/lemma — it
  carries no parse for nouns/verbs/adjectives.

So the missing ingredient is a **surface-form → (lemma, full parse) lookup** for
open-class words. That is exactly what would make the existing agreement-based
inference start working on typed Greek.

---

## 2. Why `duff_study_tool` doesn't supply it

Inspecting the repo: it is an offline **study/drill PWA** for *Elements of NT
Greek* (Duff). Its data (`js/data/…`, `js/data/supplementals/…`) is:

- per-chapter **vocabulary buckets** and rare-lemma lists,
- **pre-computed paradigm tables** for memorization drills,
- parsing-quiz challenge data.

Three problems for reuse:

1. **No generator.** It stores *lookup tables for teaching*, not a generative
   inflection engine. "Walk through every paradigm form" is drill content, not a
   `surface → parse` analyzer; `js/logic/pos_logic.js` is quiz/navigation logic.
2. **No Strong's, partial coverage.** It carries no Strong's numbers, and its
   lemma inventory is a pedagogical subset (a course's vocabulary), not the full
   NT — let alone arbitrary Koine.
3. **No license.** With no license declared, its data can't be bundled here.

It's the right tool for *drilling* morphology, the wrong source for *tagging*.

---

## 3. What "Strong's + morphology" actually requires

Worth being precise about the data shapes:

- **Strong's** is keyed by **lemma** (a dictionary: lemma → gloss, and for nouns a
  base gender). It does **not** map an *inflected surface form* to its parse —
  given `ἐποίησεν` it can't tell you "aorist active indicative 3sg of ποιέω".
- To go from a typed inflected word to a parse you need either
  (a) an **analyzed corpus / analytical lexicon** (`surface → lemma + parse`,
  finite coverage), or
  (b) a **morphological analyzer** (e.g. Morpheus/CLTK — generative, full
  coverage, heavy).

Strong's is therefore a *complement* (better glosses + lemma gender once you have
the lemma), not the tagging engine itself.

---

## 4. The opportunity already in this repo

The bundled **Nestle1904 LowFat** data carries, for *every* GNT word, full
morphology **and the Strong's number** — and the converter already keeps the
latter: `src/io/lowfat.ts` reads `strong` and stores it on
`token.morphology.extra.strong`. So Strong's numbers are *already on GNT tokens*
today; they're just not surfaced in the UI or reused for typed text.

This makes a high-value, low-risk path obvious:

> **Build a bundled `surface → {lemma, pos, morphology, strong}` index from the
> GNT analysis the app already ships, and use it to auto-tag typed Greek words
> that occur in the NT.**

Because the agreement-based inference is already written, feeding it real
case/gender/number would make typed Greek diagram about as well as a GNT verse —
for any word in NT vocabulary (the overwhelming majority of what users type).

---

## 5. Recommended plan (incremental)

**Step 1 — surface→morphology index (recommended first; small, license-clean).**
Precompute, once, a normalized-surface → analysis map from the bundled GNT (and
optionally WLC for Hebrew). Ship it as a generated data module (or build it lazily
from the lowfat XML already fetched). On `createFromText`, look each token up and
populate `lemma`/`pos`/`morphology` before `runInference`. Ambiguous forms
(several analyses) keep the most frequent and stay editable — every tag is a
provisional inference, never a hard rule (per the app's design).
*Effort: low. Coverage: ~all NT vocabulary. New deps: none.*

**Step 2 — surface Strong's + a Strong's dictionary.**
Carry `strong` from the index onto typed tokens too (it's already on GNT tokens),
then bundle an **openly-licensed** Strong's/Abbott-Smith dictionary keyed by
Strong's number for richer glosses and lemma-level gender. *Effort: low–medium.
Watch the license (use a public-domain edition).*

**Step 3 — a real analyzer for non-NT / unattested forms (optional, larger).**
Only needed for Greek outside the NT or inflections not attested there. Options:
a WASM build of an analyzer, or a server endpoint. *Effort: high; likely out of
scope for a client-only PWA. Defer until there's demand.*

**English** has the same weakness and is out of this question's scope, but the
analogous fix is a small bundled POS lexicon / lightweight tagger.

---

## 6. Verdict

| Option | Verdict |
| --- | --- |
| Bundle `duff_study_tool`'s "morphology generator" | **Not viable** — no generator, no Strong's, no license; pedagogical subset only. |
| Reuse the bundled GNT analysis as a surface→morphology index | **Recommended** — already-licensed data, no new deps, covers NT vocabulary, unlocks the existing inference. |
| Add an open Strong's dictionary on top | **Worthwhile** complement for glosses + lemma gender (Strong's numbers are already captured). |
| Full generative analyzer (Morpheus/CLTK) | **Possible but heavy** — defer; only for non-NT Greek. |

Net: skip the external tool; spend the same effort turning the morphology this
repo *already ships* into a lookup that tags typed Greek. Strong's then layers on
cheaply for glosses, since the numbers are already in the data.
