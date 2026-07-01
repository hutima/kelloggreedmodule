import { z } from 'zod';
import {
  KrDocumentSchema,
  PartOfSpeechSchema,
  SyntacticRoleSchema,
  ClauseTypeSchema,
  NodeKindSchema,
  GrammaticalCaseSchema,
  GenderSchema,
  NumberSchema,
  PersonSchema,
  TenseSchema,
  VoiceSchema,
  MoodSchema,
  DegreeSchema,
  MorphologySchema,
  type ClauseType,
  type KrDocument,
  type Direction,
  type Language,
  type Morphology,
  type PartOfSpeech,
  type Relation,
  type SyntacticRole,
  type SyntaxNode,
  type Token,
} from '@/domain/schema';
import {
  createDocument,
  detectDirection,
  detectLanguage,
  isRtlLanguage,
  makeId,
  normalizeSyntax,
} from '@/domain/model';
import type { VariantInput } from '@/domain/contested';
import type { ImportResult } from './json';

/**
 * LLM-ASSISTED DIAGRAMMING.
 *
 * Free-typed text can be auto-tagged locally (the inference engine), but a large
 * language model produces a much fuller parse. This module bridges the two:
 *
 *   buildLlmPrompt(text, tokens, language)  → a self-contained prompt the user
 *      pastes into Claude / ChatGPT. It carries the sentence, the exact token ids
 *      to reference, the compact output format, and the allowed enum values.
 *   importLlmDiagram(text)                  → parse the model's reply (the compact
 *      format) and hydrate it into a validated KrDocument, ready to load and edit.
 *
 * The compact format keeps the model's job small (linguistic content only); the
 * mechanical bits (ids, timestamps, provenance, schema version) are filled here,
 * and the final document is validated against the real KrDocumentSchema.
 */

const POS = new Set<string>(PartOfSpeechSchema.options);
const ROLES = new Set<string>(SyntacticRoleSchema.options);
const CLAUSE_TYPES = new Set<string>(ClauseTypeSchema.options);
const KINDS = new Set<string>(NodeKindSchema.options);

/** Morphology feature → its allowed enum values, for the prompt + coercion. */
const MORPH_FEATURES = {
  case: GrammaticalCaseSchema.options,
  gender: GenderSchema.options,
  number: NumberSchema.options,
  person: PersonSchema.options,
  tense: TenseSchema.options,
  voice: VoiceSchema.options,
  mood: MoodSchema.options,
  degree: DegreeSchema.options,
} as const;

export const LLM_DIAGRAM_KIND = 'scripture-diagrammer/diagram';

const GIVEN = { source: 'given', confidence: 'high' } as const;
const FROM_LLM = { source: 'manual', confidence: 'medium', reason: 'Imported from an LLM parse.' } as const;

// ── the compact format the LLM fills in (deliberately forgiving) ──────────────
const LlmTokenSchema = z.object({
  id: z.string(),
  surface: z.string(),
  pos: z.string().optional(),
  lemma: z.string().optional(),
  gloss: z.string().optional(),
  /** Latin-alphabet romanization for a non-Latin-script surface (Greek, Hebrew,
   *  Chinese, Arabic, …). Routed into `morphology.extra.translit` on hydrate. */
  transliteration: z.string().optional(),
  /** Strong's number (Biblical Greek / Hebrew), bare digits. Routed into
   *  `morphology.extra.strong` on hydrate — the same channel the GNT/OT loaders
   *  populate — so the word-detail popover shows a linked G####/H####. */
  strong: z.string().optional(),
  // A forgiving morphology bundle: any subset of the feature keys, each a free
  // string coerced/validated on hydrate (unknown values are dropped, never fatal).
  morphology: z.record(z.string()).optional(),
});
const LlmNodeSchema = z.object({
  id: z.string(),
  kind: z.string().optional(),
  role: z.string().optional(),
  clauseType: z.string().optional(),
  tokens: z.array(z.string()).default([]),
  implied: z.boolean().optional(),
  label: z.string().optional(),
});
const LlmRelationSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  head: z.string(),
  dependent: z.string(),
  label: z.string().optional(),
});
/**
 * An ALTERNATE reading of the same sentence: a full parse (its own nodes /
 * relations / rootId) plus a short label and an exegetical impact note. Tokens
 * are optional — when omitted, the variant reuses the primary diagram's tokens
 * (the common case: same words, a different tree/attachment/segmentation).
 */
const LlmVariantSchema = z.object({
  label: z.string(),
  impact: z.string().optional(),
  /** Surface words that differ from the primary reading (drives difference tags). */
  diff: z.array(z.string()).optional(),
  tokens: z.array(LlmTokenSchema).optional(),
  nodes: z.array(LlmNodeSchema).default([]),
  relations: z.array(LlmRelationSchema).default([]),
  rootId: z.string().optional(),
  text: z.string().optional(),
  language: z.string().optional(),
});
export const LlmDiagramSchema = z.object({
  kind: z.string().optional(),
  version: z.number().optional(),
  language: z.string().optional(),
  direction: z.string().optional(),
  text: z.string().optional(),
  title: z.string().optional(),
  tokens: z.array(LlmTokenSchema),
  nodes: z.array(LlmNodeSchema),
  relations: z.array(LlmRelationSchema).default([]),
  rootId: z.string().optional(),
  /** Optional alternate readings the model judged plausible for this sentence. */
  variants: z.array(LlmVariantSchema).optional(),
});
export type LlmDiagram = z.infer<typeof LlmDiagramSchema>;

const list = (s: Set<string> | readonly string[]) => [...s].join(' · ');
const morphList = Object.entries(MORPH_FEATURES)
  .map(([k, vs]) => `    ${k}: ${list(vs)}`)
  .join('\n');

/**
 * Build the copy-paste prompt for an LLM. `tokens` are the already-tokenized
 * words of `text`; their ids are what the model must reference in `nodes`.
 *
 * The prompt is LANGUAGE-AGNOSTIC: it asks the model to detect the language and
 * fill the `language` field itself (so the UI needs no error-prone language
 * dropdown). A detected hint is passed for context, but the model is the
 * authority — its answer sets the language and the parse. It also asks for full
 * MORPHOLOGY on every token (case/gender/number for nominals; person/tense/
 * voice/mood for verbs; degree for adjective/adverbs), the parse the Morphology
 * view and agreement-based inference rely on.
 */
/** A friendly name for the detected-language HINT in the prompt (the model still
 *  re-detects and is authoritative); unknown codes fall back to the code itself. */
const LANG_HINT_NAMES: Record<string, string> = {
  en: 'English',
  grc: 'Koine Greek',
  hbo: 'Biblical Hebrew',
  zh: 'Chinese',
  ja: 'Japanese',
};

export interface LlmPromptOptions {
  /** The source has had punctuation removed — ask the model to infer its own. */
  inferPunctuation?: boolean;
  /** Ask the model to include plausible ALTERNATE readings as `variants`. */
  variants?: boolean;
  /** Ask the model to return a downloadable FILE rather than inline chat text. */
  outputFile?: boolean;
}

export function buildLlmPrompt(
  text: string,
  tokens: Token[],
  language?: Language,
  opts: LlmPromptOptions = {},
): string {
  const detected = language ?? detectLanguage(text);
  const langName = LANG_HINT_NAMES[detected] ?? detected;
  const punctuationRule = opts.inferPunctuation
    ? `\n- PUNCTUATION: the source has had its punctuation REMOVED. Infer the most likely punctuation yourself — sentence breaks, commas, clause boundaries — and let that guide the parse; write the punctuated form into each diagram's "text" field. Where a different punctuation would give a materially different parse, prefer the reading you judge most likely.`
    : '';
  const variantsRule = opts.variants
    ? `\n- ALTERNATE READINGS: where the grammar is genuinely AMBIGUOUS — a participle or adjective that could modify a different head, a prepositional phrase that could attach in more than one place, a punctuation choice that shifts a clause boundary or sentence break, an objective-vs-subjective genitive that changes the tree — add a "variants" array to that sentence's object. Each entry is { "label": short name, "impact": one sentence on the exegetical/interpretive difference, "diff": [the surface words whose attachment/role differs from the primary reading], "nodes": [...], "relations": [...], "rootId": "..." } — a COMPLETE alternate parse (omit "tokens" to reuse the same words). Always fill "diff" with the words that actually change so the app can highlight them. ERR ON THE SIDE OF INCLUDING variants: give every reading you'd defend, most likely first. Omit "variants" only when the parse is genuinely uncontested.`
    : '';
  const variantsFormat = opts.variants
    ? `,
  "variants": [
    { "label": "…", "impact": "…", "diff": ["…"], "nodes": [ … ], "relations": [ … ], "rootId": "c0" }
  ]`
    : '';
  const tokenLines = tokens.map((t) => `  ${t.id} = ${JSON.stringify(t.surface)}`).join('\n');
  const tokenJson = tokens
    .map(
      (t) =>
        `    { "id": ${JSON.stringify(t.id)}, "surface": ${JSON.stringify(t.surface)}, "pos": "", "lemma": "", "gloss": "", "transliteration": "", "strong": "", "morphology": {} }`,
    )
    .join(',\n');
  return `You are a grammarian helping build a Reed-Kellogg sentence diagram. Work in whatever language the sentence is written in — ANY language, not only English/Greek/Hebrew.

SENTENCE (looks like ${langName} — but confirm the language yourself and set "language"):
${JSON.stringify(text)}

TOKENS — reference these EXACT ids in your answer:
${tokenLines}

TASK
Analyse the grammar and reply with ONE JSON object — no prose, no markdown code fences — in exactly this shape:

{
  "kind": "${LLM_DIAGRAM_KIND}",
  "version": 1,
  "language": "the language code YOU detect (en / grc / hbo, or a BCP-47 code like zh, ar, la, …)",
  "direction": "ltr or rtl (rtl for Hebrew, Arabic, Syriac … scripts)",
  "text": ${JSON.stringify(text)},
  "tokens": [
${tokenJson}
  ],
  "nodes": [
    { "id": "c0", "kind": "clause", "clauseType": "independent" },
    { "id": "n_subj", "kind": "word", "role": "subject", "tokens": ["${tokens[0]?.id ?? 't0'}"] }
  ],
  "relations": [
    { "type": "subject", "head": "c0", "dependent": "n_subj" }
  ],
  "rootId": "c0"${variantsFormat}
}

If the SENTENCE above is actually MORE THAN ONE sentence, reply with a JSON ARRAY
instead — one complete object (like the one above) per sentence:
  [ { ...diagram for sentence 1... }, { ...diagram for sentence 2... } ]

RULES
- DETECT THE LANGUAGE and set "language" to its code — "en"/"grc"/"hbo" for English/Koine Greek/Biblical Hebrew, otherwise a short BCP-47 code (e.g. "zh" Chinese, "ar" Arabic, "la" Latin). Also set "direction" to "rtl" for right-to-left scripts (Hebrew, Arabic, Syriac, …), else "ltr". Do not rely on the hint above; the sentence is authoritative.
- IF YOU CANNOT confidently analyse this language's grammar, DO NOT GUESS a parse — just TOKENIZE: emit one "clause" node (rootId) and attach each word as its own "word" node (role "unknown", pos "unknown" if unsure) so the sentence still renders as a labelled token list. A faithful token list beats a wrong tree.${punctuationRule}${variantsRule}
- Fill a "pos" for every token, plus "lemma" and a short English "gloss".
- TRANSLITERATION: for every token whose surface is NOT written in the Latin/Roman alphabet (Greek, Hebrew, Chinese, Japanese, Arabic, Cyrillic, Devanagari, …), also fill "transliteration" with a readable Latin-alphabet romanization of how the word is pronounced, using the standard scheme for that language (pinyin for Chinese, Hepburn for Japanese, academic transliteration for Greek/Hebrew, etc.). OMIT "transliteration" (or leave it "") for words already in the Latin alphabet (English, Latin, Spanish, …).
- STRONG'S NUMBERS: ONLY when "language" is "grc" (Biblical/Koine Greek) or "hbo" (Biblical Hebrew), fill "strong" with each word's Strong's number as BARE DIGITS — no G/H prefix (e.g. "3056" for λόγος, "430" for אֱלֹהִים). This is the standard James Strong concordance number for the word's lemma. OMIT "strong" (or leave it "") for EVERY OTHER language — Strong's numbering covers only Biblical Greek and Hebrew, so never invent one for English, Chinese, Latin, etc.
- MORPHOLOGY: fill "morphology" for every inflected token with the features that APPLY to it — nominals (noun/adjective/article/participle/pronoun): case, gender, number; finite verbs: person, number, tense, voice, mood (e.g. "1st person singular present active indicative"); infinitives/participles: tense, voice (+ case/gender/number for a participle); adjective/adverb comparison: degree. Omit features that do not apply, and use "morphology": {} for an uninflected word (English preposition, particle). English uses only the subset that applies (person/number/tense/degree).
- MULTIPLE SENTENCES: diagram each sentence SEPARATELY as its own object in the array, each with its own "nodes"/"relations"/"rootId" and referencing only that sentence's tokens. NEVER join two sentences into one clause or link them with a "conjunct"/"clause" relation — separate sentences are separate diagrams. Reply with a single object only when there is exactly one sentence.
- A relation reads "dependent functions as <type> of head"; "head" and "dependent" are NODE ids.
- TOKEN OWNERSHIP (the most important rule — most bad parses break it): each token is owned by EXACTLY ONE node, and owners are "word" nodes. A "clause" node is STRUCTURAL — its "tokens" is ALWAYS [] — it groups the word nodes through relations and NEVER lists their tokens. Never repeat a token across two nodes (e.g. in both a phrase and its word), and never copy a clause's or phrase's words up into that node's "tokens". The only token-less WORD node is an implied/elided element ("tokens": [], "implied": true, "label": "(he)").
- ONE WORD NODE PER WORD — NO WRAPPERS: make exactly one "word" node per word (or per fixed multi-word unit such as a verb phrase). Do NOT create a "phrase" node that merely repeats its children's tokens, and do NOT wrap a compound in an empty role node — put the role on the HEAD word and attach the rest to it (see COORDINATION). You rarely need a "phrase" node at all.
- PUNCTUATION IS NOT DIAGRAMMED: a token that is only punctuation (， 。 、 ； ： ！ ？ . , ; : ! ? — … « » " " ( ) …) gets NO node and appears in NO relation. Leave it in the "tokens" list (pos "unknown") but out of "nodes" and "relations" entirely — never make it its own "unknown" node.
- COORDINATION ("X and Y" — compound subjects, objects, verbs, or clauses): do NOT wrap the parts in a parent node. Make the FIRST part the head that carries the role (e.g. "subject"); attach each other part to that head with a "conjunct" relation and each conjunction word with a "coordinator" relation.
- A VERB PHRASE (auxiliary + main verb, e.g. "have lighted"): make ONE "predicate" node and list BOTH verb token ids in its "tokens". Do not invent roles like "auxiliary" or "head".
- A PREPOSITIONAL PHRASE: the node for the PREPOSITION word (holding the preposition's token) governs its object via "prepositionObject" and attaches to what it modifies via "prepositionalPhrase" or "adverbial". Do not make a separate empty phrase node for it.
- Attach articles/adjectives to their noun with a "determiner"/"adjectival" relation.
- "rootId" is the main clause. For two coordinated main clauses, make the first the root and attach the second with "conjunct" (and the conjunction with "coordinator").
- Use ONLY the values listed below for "pos", node "kind", relation type/role, "clauseType", and each "morphology" feature.

EXAMPLE — a compound subject "Dogs and cats sleep" (note: the FIRST conjunct carries "subject"; no wrapper node):
  nodes:  { "id":"s1","kind":"word","role":"subject","tokens":["dogs"] }, { "id":"cc","kind":"word","role":"coordinator","tokens":["and"] }, { "id":"s2","kind":"word","role":"conjunct","tokens":["cats"] }, { "id":"v","kind":"word","role":"predicate","tokens":["sleep"] }
  relations:  { "type":"subject","head":"c0","dependent":"s1" }, { "type":"conjunct","head":"s1","dependent":"s2" }, { "type":"coordinator","head":"s1","dependent":"cc" }, { "type":"predicate","head":"c0","dependent":"v" }

BEFORE YOU REPLY, check each of these and FIX any that fail (this is where parses usually go wrong — dropped or duplicated words):
  1. COUNT — every NON-punctuation token in the TOKENS list appears in EXACTLY ONE node's "tokens": none dropped, none in two nodes.
  2. Every "clause" node has "tokens": [] (its words live in their own word nodes, not on the clause).
  3. No punctuation token has a node or a relation.
  4. Every relation "head"/"dependent" is a node id that exists, and "rootId" is your top clause.

ALLOWED VALUES
- pos: ${list(POS)}
- node kind: ${list(KINDS)}
- relation type / role: ${list(ROLES)}
- clauseType: ${list(CLAUSE_TYPES)}
- morphology features (fill the keys that apply):
${morphList}

${
  opts.outputFile
    ? 'Return your answer AS A DOWNLOADABLE FILE — a .json file / artifact / canvas whose contents are ONLY the JSON (no prose, no code fence) — rather than pasting it into the chat. Name it "diagram.json".'
    : 'Reply with only the JSON object.'
}`;
}

/** Result of importing possibly-several diagrams (one per sentence). */
export interface MultiImportResult {
  ok: boolean;
  documents?: KrDocument[];
  /** Alternate readings per document (aligned with `documents`); empty if none. */
  variantsByDoc?: VariantInput[][];
  error?: string;
}

// ── importing the model's reply ───────────────────────────────────────────────
function relax(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/^\s*```(?:json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
    .replace(/[“”„‟″‶]/g, '"')
    .replace(/[‘’‚‛′‵]/g, "'")
    .trim();
}

const asPos = (p?: string): PartOfSpeech | undefined =>
  p ? ((POS.has(p) ? p : 'unknown') as PartOfSpeech) : undefined;
const asRole = (r?: string): SyntacticRole | undefined =>
  r ? ((ROLES.has(r) ? r : 'unknown') as SyntacticRole) : undefined;
const asClause = (c?: string): ClauseType | undefined =>
  c ? ((CLAUSE_TYPES.has(c) ? c : 'unknown') as ClauseType) : undefined;
const asKind = (k?: string): SyntaxNode['kind'] => (k && KINDS.has(k) ? (k as SyntaxNode['kind']) : 'word');

/** Normalize a Strong's number to bare digits (drop a leading G/H prefix); the
 *  strongsRow UI adds the prefix back. Rejects a value that isn't a number. */
function normalizeStrong(v?: string): string | undefined {
  if (!v) return undefined;
  const s = v.trim().replace(/^[gh]/i, '');
  return /^\d/.test(s) ? s : undefined;
}

/** A surface that is ONLY punctuation / whitespace, in any script (Latin `.,;:`,
 *  CJK `，。、！？：；「」（）`, dashes, ellipses, quotes …). Such a token is never
 *  diagrammed, so any node the model built for one is dropped on import. */
const PUNCT_ONLY = /^[\p{P}\s]+$/u;
function isPunctuationSurface(s: string): boolean {
  return !!s && PUNCT_ONLY.test(s);
}

/**
 * Coerce a loose morphology record into a validated Morphology bundle: keep only
 * known features whose value is in that feature's enum; anything else (a stray
 * key, a mis-spelled value) is preserved under `extra` so nothing is silently
 * lost. Two enrichments the model supplies for non-English text ride in `extra`
 * on the SAME channels the GNT/OT/Hebrew sources use, so the word-detail popover
 * shows them with no UI change: `translit` (romanization → `transliterationOf`)
 * and `strong` (Strong's number → the linked G####/H#### row).
 * Returns undefined when there is nothing usable.
 */
function asMorphology(
  m?: Record<string, string>,
  extras: { translit?: string; strong?: string; allowStrong?: boolean } = {},
): Morphology | undefined {
  const out: Record<string, string> = {};
  const extra: Record<string, string> = {};
  if (m && typeof m === 'object') {
    for (const [key, valRaw] of Object.entries(m)) {
      if (typeof valRaw !== 'string' || !valRaw) continue;
      const val = valRaw.toLowerCase();
      const allowed = (MORPH_FEATURES as Record<string, readonly string[]>)[key];
      if (allowed && allowed.includes(val)) out[key] = val;
      else extra[key] = valRaw;
    }
  }
  // Explicit top-level fields win, but a value nested inside morphology (e.g.
  // "transliteration"/"strong") is honoured too — either way it lands in extra.
  const roman = extras.translit?.trim() || extra.transliteration;
  if (roman) extra.translit = roman;
  delete extra.transliteration;
  // Strong's numbering covers ONLY Biblical Greek/Hebrew — drop it on any other
  // language even if the model supplied one (nested or top-level).
  const strong = extras.allowStrong ? normalizeStrong(extras.strong ?? extra.strong) : undefined;
  if (strong) extra.strong = strong;
  else delete extra.strong;
  if (Object.keys(extra).length) out.extra = extra as never;
  const parsed = MorphologySchema.safeParse(out);
  return parsed.success && Object.keys(parsed.data).length ? parsed.data : undefined;
}

/** Parse JSON, retrying once after relaxing code fences / smart quotes. */
function parseJsonLoose(text: string): { ok: true; raw: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, raw: JSON.parse(text) };
  } catch {
    try {
      return { ok: true, raw: JSON.parse(relax(text)) };
    } catch (e) {
      return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
    }
  }
}

/**
 * Parse an LLM reply in the compact diagram format and hydrate it into a fully
 * validated KrDocument. Tolerant of code fences / smart quotes and of unknown
 * enum values (coerced to `unknown`), but rejects structural breakage (a relation
 * pointing at a missing node, or no root clause) with a readable message.
 */
export function importLlmDiagram(text: string, opts: { title?: string } = {}): ImportResult {
  const parsed0 = parseJsonLoose(text);
  if (!parsed0.ok) return { ok: false, error: parsed0.error };
  return hydrateDiagram(parsed0.raw, opts);
}

/**
 * Import possibly-SEVERAL diagrams — one per sentence. A multi-sentence reply is a
 * JSON array (or a `{ "diagrams": [...] }` wrapper) of diagram objects; a single
 * sentence is one object. Each becomes its own document, so separate sentences are
 * separate diagrams instead of being wrongly linked into one clause.
 */
export function importLlmDiagrams(text: string, opts: { title?: string } = {}): MultiImportResult {
  const parsed0 = parseJsonLoose(text);
  if (!parsed0.ok) return { ok: false, error: parsed0.error };
  const raw = parsed0.raw;
  const wrapped = raw as { diagrams?: unknown };
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray(wrapped?.diagrams)
      ? wrapped.diagrams
      : [raw];
  if (!items.length) return { ok: false, error: 'No diagrams found.' };
  const documents: KrDocument[] = [];
  const variantsByDoc: VariantInput[][] = [];
  for (let i = 0; i < items.length; i++) {
    // Let each sentence take its own title from its text; only pass the caller's
    // title through when there is a single diagram.
    const res = hydrateDiagram(items[i], { title: items.length > 1 ? undefined : opts.title });
    if (!res.ok || !res.document) {
      return { ok: false, error: items.length > 1 ? `Sentence ${i + 1}: ${res.error}` : res.error };
    }
    documents.push(res.document);
    variantsByDoc.push(res.variants ?? []);
  }
  return { ok: true, documents, variantsByDoc };
}

/** The diagram fields (shared by a primary diagram and each of its variants). */
interface HydrateFields {
  tokens?: z.infer<typeof LlmTokenSchema>[];
  nodes: z.infer<typeof LlmNodeSchema>[];
  relations: z.infer<typeof LlmRelationSchema>[];
  rootId?: string;
  text?: string;
  language?: string;
  direction?: string;
}

/**
 * Build one validated KrDocument from a diagram's fields. `fallbackTokens` are
 * the primary diagram's tokens, reused when a variant omits its own (same words,
 * a different tree). Returns a readable error rather than throwing.
 */
function hydrateFields(
  d: HydrateFields,
  opts: { title?: string; fallbackTokens?: Token[]; fallbackText?: string; fallbackLanguage?: Language },
): { ok: true; document: KrDocument } | { ok: false; error: string } {
  // Any non-empty language code is accepted — not just en/grc/hbo — so a sentence
  // in any language imports faithfully.
  const language: Language = d.language?.trim() || opts.fallbackLanguage || 'en';
  // Strong's numbering exists only for Biblical Greek and Hebrew.
  const allowStrong = language === 'grc' || language === 'hbo';

  const tokens: Token[] =
    d.tokens && d.tokens.length
      ? d.tokens.map((t, i) => {
          const morphology = asMorphology(t.morphology, {
            translit: t.transliteration,
            strong: t.strong,
            allowStrong,
          });
          return {
            id: t.id,
            index: i,
            surface: t.surface,
            language,
            ...(asPos(t.pos) ? { pos: asPos(t.pos) } : {}),
            ...(t.lemma ? { lemma: t.lemma } : {}),
            ...(t.gloss ? { gloss: t.gloss } : {}),
            ...(morphology ? { morphology } : {}),
            provenance: GIVEN,
          };
        })
      : (opts.fallbackTokens ?? []);
  const tokenIds = new Set(tokens.map((t) => t.id));
  if (!tokens.length) return { ok: false, error: 'No tokens in the imported diagram.' };

  let nodes: SyntaxNode[] = d.nodes.map((n) => ({
    id: n.id,
    kind: asKind(n.kind ?? (n.clauseType ? 'clause' : n.tokens.length ? 'word' : undefined)),
    ...(asRole(n.role) ? { role: asRole(n.role) } : {}),
    ...(asClause(n.clauseType) ? { clauseType: asClause(n.clauseType) } : {}),
    tokenIds: n.tokens.filter((id) => tokenIds.has(id)),
    ...(n.implied ? { implied: true } : {}),
    ...(n.label ? { label: n.label } : {}),
    provenance: FROM_LLM,
  }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (!nodes.length) return { ok: false, error: 'No nodes in the imported diagram.' };

  let relations: Relation[] = [];
  for (const r of d.relations) {
    if (!nodeIds.has(r.head) || !nodeIds.has(r.dependent)) {
      return { ok: false, error: `Relation references an unknown node: ${r.head} → ${r.dependent}.` };
    }
    relations.push({
      id: r.id ?? makeId('rel'),
      type: asRole(r.type) ?? 'unknown',
      headId: r.head,
      dependentId: r.dependent,
      ...(r.label ? { label: r.label } : {}),
      provenance: FROM_LLM,
    });
  }

  const rootId =
    d.rootId && nodeIds.has(d.rootId) ? d.rootId : nodes.find((n) => n.kind === 'clause')?.id;
  if (!rootId) return { ok: false, error: 'No root clause node (need a node with kind "clause").' };

  // Punctuation is NOT diagrammed. Strip punctuation-only tokens from every node
  // (so a clause can't carry a stray comma either), then drop any leaf node the
  // model built purely for punctuation, plus its relations — belt-and-braces for
  // the prompt rule, since such a node uniquely owns its token and would survive
  // normalization and clutter the diagram as an "unknown" tick.
  const punctTokenIds = new Set(tokens.filter((t) => isPunctuationSurface(t.surface)).map((t) => t.id));
  if (punctTokenIds.size) {
    for (const n of nodes) n.tokenIds = n.tokenIds.filter((id) => !punctTokenIds.has(id));
    const heads = new Set(relations.map((r) => r.headId));
    const drop = new Set(
      nodes
        .filter((n) => n.id !== rootId && n.kind !== 'clause' && !n.implied && !n.label)
        .filter((n) => n.tokenIds.length === 0 && !heads.has(n.id))
        .map((n) => n.id),
    );
    if (drop.size) {
      nodes = nodes.filter((n) => !drop.has(n.id));
      relations = relations.filter((r) => !drop.has(r.headId) && !drop.has(r.dependentId));
    }
  }

  const text = d.text ?? opts.fallbackText ?? tokens.map((t) => t.surface).join(' ');
  const title = opts.title ?? titleFromText(text);
  // Direction: the model's explicit value if valid, else inferred from language/script.
  const direction: Direction =
    d.direction === 'rtl' || d.direction === 'ltr'
      ? d.direction
      : isRtlLanguage(language) || detectDirection(text) === 'rtl'
        ? 'rtl'
        : 'ltr';
  const base = createDocument({ language, title, text, direction });
  // Normalize so an over-specified reply (a phrase node plus its child words both
  // carrying the same tokens, or a node hung under two heads) never draws a word twice.
  const doc = normalizeSyntax({ ...base, tokens, syntax: { rootId, nodes, relations } } as KrDocument);

  const result = KrDocumentSchema.safeParse(doc);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
    };
  }
  return { ok: true, document: result.data };
}

/** Validate + hydrate one already-parsed diagram object into a KrDocument (+ its variants). */
function hydrateDiagram(
  raw: unknown,
  opts: { title?: string } = {},
): ImportResult & { variants?: VariantInput[] } {
  const parsed = LlmDiagramSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
    };
  }
  const d = parsed.data;
  const primary = hydrateFields(d, { title: opts.title ?? d.title });
  if (!primary.ok) return { ok: false, error: primary.error };

  // Alternate readings share the primary's tokens unless they supply their own.
  const variants: VariantInput[] = [];
  for (const v of d.variants ?? []) {
    const res = hydrateFields(v, {
      title: v.label,
      fallbackTokens: primary.document.tokens,
      fallbackText: primary.document.text,
      fallbackLanguage: primary.document.language,
    });
    if (res.ok) variants.push({ label: v.label, impact: v.impact, diffWords: v.diff, doc: res.document });
    // A malformed variant is skipped, never fatal — the primary parse still loads.
  }
  return { ok: true, document: primary.document, variants };
}

/** A short title from the opening words of the sentence. */
export function titleFromText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'New diagram';
  const words = trimmed.split(' ').slice(0, 6).join(' ');
  return words.length < trimmed.length ? `${words}…` : words;
}
