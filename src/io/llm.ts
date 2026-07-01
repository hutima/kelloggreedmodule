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
  type Language,
  type Morphology,
  type PartOfSpeech,
  type Relation,
  type SyntacticRole,
  type SyntaxNode,
  type Token,
} from '@/domain/schema';
import { createDocument, detectLanguage, makeId, normalizeSyntax } from '@/domain/model';
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
export const LlmDiagramSchema = z.object({
  kind: z.string().optional(),
  version: z.number().optional(),
  language: z.string().optional(),
  text: z.string().optional(),
  title: z.string().optional(),
  tokens: z.array(LlmTokenSchema),
  nodes: z.array(LlmNodeSchema),
  relations: z.array(LlmRelationSchema).default([]),
  rootId: z.string().optional(),
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
export interface LlmPromptOptions {
  /** The source has had punctuation removed — ask the model to infer its own. */
  inferPunctuation?: boolean;
}

export function buildLlmPrompt(
  text: string,
  tokens: Token[],
  language?: Language,
  opts: LlmPromptOptions = {},
): string {
  const detected = language ?? detectLanguage(text);
  const langName =
    detected === 'grc' ? 'Koine Greek' : detected === 'hbo' ? 'Biblical Hebrew' : 'English';
  const punctuationRule = opts.inferPunctuation
    ? `\n- PUNCTUATION: the source has had its punctuation REMOVED. Infer the most likely punctuation yourself — sentence breaks, commas, clause boundaries — and let that guide the parse; write the punctuated form into each diagram's "text" field. Where a different punctuation would give a materially different parse, prefer the reading you judge most likely.`
    : '';
  const tokenLines = tokens.map((t) => `  ${t.id} = ${JSON.stringify(t.surface)}`).join('\n');
  const tokenJson = tokens
    .map(
      (t) =>
        `    { "id": ${JSON.stringify(t.id)}, "surface": ${JSON.stringify(t.surface)}, "pos": "", "lemma": "", "gloss": "", "morphology": {} }`,
    )
    .join(',\n');
  return `You are a grammarian helping build a Reed-Kellogg sentence diagram. Work in whatever language the sentence is written in — English, Koine Greek, or Biblical Hebrew.

SENTENCE (looks like ${langName} — confirm this yourself and set "language" accordingly):
${JSON.stringify(text)}

TOKENS — reference these EXACT ids in your answer:
${tokenLines}

TASK
Analyse the grammar and reply with ONE JSON object — no prose, no markdown code fences — in exactly this shape:

{
  "kind": "${LLM_DIAGRAM_KIND}",
  "version": 1,
  "language": "en | grc | hbo — the language YOU detect",
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
  "rootId": "c0"
}

If the SENTENCE above is actually MORE THAN ONE sentence, reply with a JSON ARRAY
instead — one complete object (like the one above) per sentence:
  [ { ...diagram for sentence 1... }, { ...diagram for sentence 2... } ]

RULES
- DETECT THE LANGUAGE from the script/words and set "language" to "en", "grc", or "hbo". Do not rely on the hint above; the sentence is authoritative.${punctuationRule}
- Fill a "pos" for every token, plus "lemma" and a short English "gloss".
- MORPHOLOGY: fill "morphology" for every inflected token with the features that APPLY to it — nominals (noun/adjective/article/participle/pronoun): case, gender, number; finite verbs: person, number, tense, voice, mood (e.g. "1st person singular present active indicative"); infinitives/participles: tense, voice (+ case/gender/number for a participle); adjective/adverb comparison: degree. Omit features that do not apply, and use "morphology": {} for an uninflected word (English preposition, particle). English uses only the subset that applies (person/number/tense/degree).
- MULTIPLE SENTENCES: diagram each sentence SEPARATELY as its own object in the array, each with its own "nodes"/"relations"/"rootId" and referencing only that sentence's tokens. NEVER join two sentences into one clause or link them with a "conjunct"/"clause" relation — separate sentences are separate diagrams. Reply with a single object only when there is exactly one sentence.
- A relation reads "dependent functions as <type> of head"; "head" and "dependent" are NODE ids.
- EVERY node must OWN at least one token in "tokens" — the ONLY exception is an implied/elided element ("tokens": [], "implied": true, "label": "(he)"). NEVER create an empty grouping node (a node with no tokens that only holds other nodes) — empty wrappers are dropped and their contents lose their role.
- COORDINATION ("X and Y" — compound subjects, objects, verbs, or clauses): do NOT wrap the parts in a parent node. Make the FIRST part the head that carries the role (e.g. "subject"); attach each other part to that head with a "conjunct" relation and each conjunction word with a "coordinator" relation.
- A VERB PHRASE (auxiliary + main verb, e.g. "have lighted"): make ONE "predicate" node and list BOTH verb token ids in its "tokens". Do not invent roles like "auxiliary" or "head".
- A PREPOSITIONAL PHRASE: the node for the PREPOSITION word (holding the preposition's token) governs its object via "prepositionObject" and attaches to what it modifies via "prepositionalPhrase" or "adverbial". Do not make a separate empty phrase node for it.
- Attach articles/adjectives to their noun with a "determiner"/"adjectival" relation.
- "rootId" is the main clause. For two coordinated main clauses, make the first the root and attach the second with "conjunct" (and the conjunction with "coordinator").
- Use ONLY the values listed below for "pos", node "kind", relation type/role, "clauseType", and each "morphology" feature.

EXAMPLE — a compound subject "Dogs and cats sleep" (note: the FIRST conjunct carries "subject"; no wrapper node):
  nodes:  { "id":"s1","kind":"word","role":"subject","tokens":["dogs"] }, { "id":"cc","kind":"word","role":"coordinator","tokens":["and"] }, { "id":"s2","kind":"word","role":"conjunct","tokens":["cats"] }, { "id":"v","kind":"word","role":"predicate","tokens":["sleep"] }
  relations:  { "type":"subject","head":"c0","dependent":"s1" }, { "type":"conjunct","head":"s1","dependent":"s2" }, { "type":"coordinator","head":"s1","dependent":"cc" }, { "type":"predicate","head":"c0","dependent":"v" }

ALLOWED VALUES
- pos: ${list(POS)}
- node kind: ${list(KINDS)}
- relation type / role: ${list(ROLES)}
- clauseType: ${list(CLAUSE_TYPES)}
- morphology features (fill the keys that apply):
${morphList}

Reply with only the JSON object.`;
}

/** Result of importing possibly-several diagrams (one per sentence). */
export interface MultiImportResult {
  ok: boolean;
  documents?: KrDocument[];
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

/**
 * Coerce a loose morphology record into a validated Morphology bundle: keep only
 * known features whose value is in that feature's enum; anything else (a stray
 * key, a mis-spelled value) is preserved under `extra` so nothing is silently
 * lost. Returns undefined when there is nothing usable.
 */
function asMorphology(m?: Record<string, string>): Morphology | undefined {
  if (!m || typeof m !== 'object') return undefined;
  const out: Record<string, string> = {};
  const extra: Record<string, string> = {};
  for (const [key, valRaw] of Object.entries(m)) {
    if (typeof valRaw !== 'string' || !valRaw) continue;
    const val = valRaw.toLowerCase();
    const allowed = (MORPH_FEATURES as Record<string, readonly string[]>)[key];
    if (allowed && allowed.includes(val)) out[key] = val;
    else extra[key] = valRaw;
  }
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
  for (let i = 0; i < items.length; i++) {
    // Let each sentence take its own title from its text; only pass the caller's
    // title through when there is a single diagram.
    const res = hydrateDiagram(items[i], { title: items.length > 1 ? undefined : opts.title });
    if (!res.ok || !res.document) {
      return { ok: false, error: items.length > 1 ? `Sentence ${i + 1}: ${res.error}` : res.error };
    }
    documents.push(res.document);
  }
  return { ok: true, documents };
}

/** Validate + hydrate one already-parsed diagram object into a KrDocument. */
function hydrateDiagram(raw: unknown, opts: { title?: string } = {}): ImportResult {
  const parsed = LlmDiagramSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
    };
  }
  const d = parsed.data;
  const language: Language = (['en', 'grc', 'hbo'] as const).includes(d.language as Language)
    ? (d.language as Language)
    : 'en';

  const tokens: Token[] = d.tokens.map((t, i) => {
    const morphology = asMorphology(t.morphology);
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
  });
  const tokenIds = new Set(tokens.map((t) => t.id));

  const nodes: SyntaxNode[] = d.nodes.map((n) => ({
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

  const relations: Relation[] = [];
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

  const title = opts.title ?? d.title ?? titleFromText(d.text ?? tokens.map((t) => t.surface).join(' '));
  const base = createDocument({ language, title, text: d.text ?? tokens.map((t) => t.surface).join(' ') });
  // Normalize so an over-specified reply (a phrase node plus its child words both
  // carrying the same tokens, or a node hung under two heads) never draws a word
  // twice.
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

/** A short title from the opening words of the sentence. */
export function titleFromText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'New diagram';
  const words = trimmed.split(' ').slice(0, 6).join(' ');
  return words.length < trimmed.length ? `${words}…` : words;
}
