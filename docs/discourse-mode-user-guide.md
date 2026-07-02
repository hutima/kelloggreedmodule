# Discourse Mode — User Guide

> Discourse mode is an interpretive outline and relationship layer over the
> passage. Source data may suggest markers and boundaries, but user-authored
> structure is **your** analysis.

Where the syntax visualizations (Kellogg-Reed, Phrase/Block, Dependency,
Constituency, Morphology) diagram **one sentence's grammar**, Discourse mode
analyzes the **argument, movement, rhetoric, and macro-structure** of a larger
passage — a section (Ephesians 5:3–33), a sweep of chapters (Romans 9–11), or
a whole book (Philemon). Its unit of analysis is a **discourse unit** (a block
of text), not an individual word.

## Getting in and out

1. Pick **Visualization → Discourse** (the mode selector in the diagram header).
2. The passage panel on the left switches to the **discourse range selector**.
3. Load a range. Your open syntax passage is untouched — switch back to any
   syntax view at any time and it is exactly where you left it; switch to
   Discourse again and your range is exactly where you left it. The two never
   overwrite each other.

## Loading a range

The range selector offers:

- **Source** — a Greek/Hebrew **syntax** source (SBLGNT Lowfat (default),
  Nestle 1904 Lowfat, or OpenText) **or** an **English Bible** (BSB English for
  the NT, BSB English OT for the Old Testament, **KJV**, or **ASV**). English
  Bible sources are offered **only in Discourse mode** and load directly from
  verse text — no Greek/Hebrew syntax parse is required (see *English Bible
  discourse* below). KJV and ASV are English-only, fetched on demand from
  public-domain data and cached; they add **no** original-language linking,
  morphology, or discourse-marker hints.
- **Book**, **From** and **To** references (chapter : verse).
- **Whole book** and **Chapter…** shortcuts.
- **Unit size** — one unit per source *sentence* (recommended) or per *verse*.
- An **estimated unit count**, with a warning for very large ranges.

Whole short books load comfortably. Long books load too — chapters open
collapsed so the outline stays navigable; expand what you're working on.

## Reading the outline (Explore mode)

- Each **unit block** shows its verse reference, your label (if any), the
  Greek text, optional English glosses (Ελ / Eng / Both toggle), and
  **marker chips** for discourse-relevant particles (γάρ, οὖν, δέ, ἀλλά,
  ἵνα…). A chip's wording is always *"possible …"* — particles are clues the
  source offers, never conclusions it draws.
- **Relation arcs/brackets** in the left gutter connect related units;
  chiasm / parallel / inclusio pairs draw dashed. Arcs are never the only
  reading: select a unit and its relations are **listed textually** in the
  inspector below.
- Header toggles: Markers · Arcs · Labels · Full/Compact · Collapse/Expand
  all · **Outline** (a searchable minimap — type a word or a reference like
  `5:21` to jump) · **Hints** (the suggestions panel).

## Editing the analysis (Edit mode, desktop)

Switch the app to **Edit** mode. The discourse toolbar appears. Everything
below edits the *discourse layer only* — your syntax edits, sermon notes, and
the source data itself are never touched.

| Action | Toolbar | Keyboard |
| --- | --- | --- |
| Insert a break (split a unit) | **Split**, then click the word that starts the new unit | `Enter` on the selected unit |
| Merge into the previous unit | **Merge ←** | `Backspace` / `Delete` |
| Indent under the previous unit | **→ Indent** | `Tab` |
| Outdent one level | **← Outdent** | `Shift+Tab` |
| Move among siblings | **↑ / ↓** | — |
| Group units under a new parent | shift-click several units, **Group** | — |
| Ungroup a parent | **Ungroup** | — |
| Label a unit (A, B′, "Household code"…) | **Label…** or the inspector | — |
| Delete a unit / remove a verse | **Delete unit** (a group asks first, then deletes its whole subtree) | `Shift+Delete` / `Shift+Backspace` |
| Notes | inspector | — |
| Draw a relation | **Relate →**, click the target, pick the type | `Esc` cancels |
| Undo / redo | **↶ / ↷** | `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` |
| Discard all discourse edits | **Reset edits…** (asks first) | — |

**Indentation is an interpretive outline, not a syntactic claim.** Nesting a
unit under another says *"I read this as subordinate in the argument"* —
nothing about the Greek clause structure changes.

**Deleting a unit** removes an unwanted verse or block from *this* analysis
only. It is a discourse-layer edit: the source text, the syntax documents,
sermon notes, and your syntax edits are never touched. Deleting a **group**
(container) removes its whole subtree — you're asked first. Deletion cleans up
after itself: relations, marker chips, and suggestions that referenced the gone
unit disappear, sibling order and container spans stay valid, and the change is
**undoable** and **persisted** as part of your discourse diff (so it survives a
reload, and **Reset edits** brings the verse back).

**Relations** (ground, inference, result, purpose, condition, concession,
contrast, series, coordinate, elaboration, explanation, quotation, inclusio,
parallel, chiasm, custom) connect a *source* unit to a *target* unit. Select a
relation in the inspector to edit its type, label, confidence, notes, and the
marker chips you cite as evidence — or delete it.

**Chiasm / parallelism**: label units `A`, `B`, `C`, `C′`, `B′`, `A′` and pair
them with `chiasm` / `parallel` relations — the paired arcs draw dashed.

## Hints (suggestions panel)

The **Hints** panel lists *candidates* the source data supports: possible
grounds (γάρ), inferences (οὖν, διό, ἄρα), contrasts (ἀλλά, πλήν, οὐ…ἀλλά),
μέν/δέ pairs, command→γάρ patterns, possible break points at verse seams,
repeated lemmas/phrases, and inclusio candidates.

- Nothing in this panel changes your diagram by itself.
- **Accept** (Edit mode) turns a hint into a normal, editable relation or
  break — from that moment it is yours to reshape or delete.
- **Dismiss** hides a hint (it stays hidden when you reload).
- Ignoring a hint costs nothing. The machine may point at γάρ; it should not
  preach the sermon.

## English Bible discourse (no syntax parse)

Discourse mode can analyze an **English Bible directly**, without routing the
passage through Greek or Hebrew syntax first. Pick **BSB English** (New
Testament), **BSB English OT** (Old Testament), **KJV**, or **ASV** as the
source, then load a range exactly as you would for a Greek/Hebrew source. Under
the hood the range is built straight from English verse text into a discourse
document (`language: "en"`) — there is **no sentence-level grammar diagram**
behind it, and none is implied. For English sources the source-text / gloss /
both toggle is hidden (the text is already English).

Everything else works the same: split (at English word boundaries), merge,
indent/outdent, label, notes, relations, outline navigation, export, delete,
undo/redo, and persistence. Marker chips are a small, conservative set of
English discourse words ("therefore", "because", "but", "if"…), always phrased
as *possible* hints.

**Tagging is honest, never invented.** BSB retains the alignment the data
actually carries: NT words keep their **Strong's number** (Greek tagging) where
aligned; OT words keep their **Hebrew alignment** (the Hebrew text carries no
Strong's number, so none is shown). Words with no alignment (function words,
punctuation) are simply plain text.

**KJV and ASV are plain English only.** They are fetched on demand from
public-domain remote data (KJV per-book, ASV once for the whole Bible) and
cached after the first load; no Bible text ships in the app. They carry **no**
Strong's numbers, lemmas, morphology, Greek/Hebrew alignment, or MACULA
discourse-marker hints — only the conservative English marker lexicon applies.
If a remote fetch fails you'll see a readable error, and your existing discourse
and syntax work is untouched.

Because every visualization is a lens over one model, the discourse operations
above are identical whether the tokens came from Greek, Hebrew, or English.

## New text (plaintext) — analyze your own words

The **New text** tab in the Discourse left panel loads pasted prose directly as
sentence units. Paste a paragraph (a translation, a draft, your own notes),
optionally give it a title, and press **Load text**. It is tokenized locally and
split into sentences (`.` `?` `!`, plus blank-line paragraph breaks); each
sentence becomes a unit you can split, merge, indent, label, relate, and export
like any other discourse document.

This is deliberately simple: **no AI/LLM parse**, no Greek/Hebrew tagging, no
sentence-diagram, and no discourse-marker hints are generated — it is exactly the
words you pasted. Ids are derived from the text itself, so re-pasting the same
text restores your edits; **Reset edits** clears only that plaintext document.

## Persistence & reset

Your discourse edits are stored as a compact diff against the generated base,
in their own storage (`kr:discourse:…`), keyed by source edition + book +
range + unit size, and guarded by a fingerprint so they are never misapplied
to different source data. They survive reloads. **Reset edits** removes only
the discourse diff for the loaded range — syntax edits, sermon prep, and
notes live in different keys and are unaffected.

## Export

**Export analysis** (top bar) offers:

- **Save as PDF** — opens a print-ready outline; choose *"Save as PDF"* in your
  browser's print dialog (labels, references, optional text/glosses, notes, and
  relations, laid out for the page);
- the same outline as a self-contained **vector SVG**;
- the full discourse **document as JSON** (schema-validated, re-importable);
- your **edits as a patch** (compact JSON diff);
- the **outline as Markdown** — labels, references, optional Greek text and
  glosses, notes, and relations;
- the **relation table** as Markdown or CSV.

The discourse outline is a text analysis, so PDF and SVG render the *outline*
(not layout geometry — that belongs to the syntax visualizations). The
include-text / include-glosses checkboxes apply to the PDF and SVG too.

## What the source data does — and does not — provide

MACULA / SBLGNT Lowfat supplies tokens, references, sentence boundaries,
morphology, lemmas, glosses, and the particles the hints are built from. It
does **not** provide finalized discourse-arc relationships — no published
"correct" answer is being hidden from you. Every arc in your outline is either
something you drew or a hint you explicitly accepted.
