import {
  ClauseTypeSchema,
  DegreeSchema,
  GenderSchema,
  GrammaticalCaseSchema,
  type Language,
  MoodSchema,
  NumberSchema,
  PartOfSpeechSchema,
  PersonSchema,
  SyntacticRoleSchema,
  TenseSchema,
  VoiceSchema,
} from '@/domain/schema';

// Morphology fields, derived from the schemas so the prompt tracks the model.
const MORPH_FIELDS = [
  { key: 'case', options: GrammaticalCaseSchema.options },
  { key: 'gender', options: GenderSchema.options },
  { key: 'number', options: NumberSchema.options },
  { key: 'person', options: PersonSchema.options },
  { key: 'tense', options: TenseSchema.options },
  { key: 'voice', options: VoiceSchema.options },
  { key: 'mood', options: MoodSchema.options },
  { key: 'degree', options: DegreeSchema.options },
] as const;

/**
 * Builds the LLM prompt that asks a chat model to parse and tag a sentence and
 * return a valid `KrDocument` JSON (paste into the app's JSON tab → Apply).
 *
 * The enum lists are derived from the Zod schemas, so the prompt can never
 * drift from what the importer will actually accept — extend an enum and the
 * prompt updates itself.
 *
 * Pass a `text`/`language` to fill the prompt in; omit them to produce the
 * reusable template (with {{SENTENCE}} / {{LANGUAGE}} placeholders) used for
 * `docs/parse-prompt.txt`.
 */
export interface ParsePromptOptions {
  text?: string;
  language?: Language;
}

/**
 * A complete, schema-valid example shipped inside the prompt so the model has a
 * concrete template to mirror. Exported so a test can assert it stays valid.
 */
export const PARSE_EXAMPLE = {
  schemaVersion: 1,
  id: 'doc_paste',
  title: 'The Word became flesh',
  language: 'en',
  text: 'The Word became flesh.',
  notes: '',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  layoutHints: {},
  tokens: [
    { id: 't1', index: 0, surface: 'The', pos: 'article' },
    { id: 't2', index: 1, surface: 'Word', pos: 'noun' },
    { id: 't3', index: 2, surface: 'became', lemma: 'become', pos: 'verb' },
    { id: 't4', index: 3, surface: 'flesh.', lemma: 'flesh', pos: 'noun' },
  ],
  syntax: {
    rootId: 'n_root',
    nodes: [
      { id: 'n_root', kind: 'clause', clauseType: 'independent', tokenIds: [] },
      { id: 'n_word', kind: 'word', role: 'subject', tokenIds: ['t2'] },
      { id: 'n_the', kind: 'word', role: 'determiner', tokenIds: ['t1'] },
      { id: 'n_became', kind: 'word', role: 'predicate', tokenIds: ['t3'] },
      { id: 'n_flesh', kind: 'word', role: 'predicateNominative', tokenIds: ['t4'] },
    ],
    relations: [
      { id: 'r1', type: 'subject', headId: 'n_root', dependentId: 'n_word' },
      { id: 'r2', type: 'determiner', headId: 'n_word', dependentId: 'n_the' },
      { id: 'r3', type: 'predicate', headId: 'n_root', dependentId: 'n_became' },
      { id: 'r4', type: 'predicateNominative', headId: 'n_became', dependentId: 'n_flesh' },
    ],
  },
} as const;

const WORKED_EXAMPLE = `WORKED EXAMPLE (English: "The Word became flesh."):

${JSON.stringify(PARSE_EXAMPLE, null, 2)}`;

/** Wraps a long enum list to a readable indented block. */
function wrap(values: readonly string[], indent = '    '): string {
  const out: string[] = [];
  let line = indent;
  for (const v of values) {
    const piece = (line === indent ? '' : ', ') + v;
    if ((line + piece).length > 76) {
      out.push(line + ',');
      line = indent + v;
    } else {
      line += piece;
    }
  }
  out.push(line);
  return out.join('\n');
}

export function buildParsePrompt(opts: ParsePromptOptions = {}): string {
  const sentence = opts.text?.trim() ? opts.text.trim() : '{{SENTENCE}}';
  const language = opts.language ?? '{{LANGUAGE}}';

  const morph = MORPH_FIELDS.map(
    (f) => `    ${f.key.padEnd(6)} = ${f.options.join(' | ')}`,
  ).join('\n');

  return `You are a linguistic parser that outputs Kellogg-Reed diagram JSON. Parse and
tag the sentence below and return ONE JSON object only — no prose, no markdown
code fences.

OUTPUT FORMAT (strict): emit RFC 8259 JSON. Use ONLY straight ASCII double
quotes (") around every key and string value. Do NOT use curly/smart quotes
(“ ” ‘ ’) or single quotes — these break JSON.parse. No trailing commas, no
comments in the final answer.

Sentence: ${sentence}
Language: ${language}        (use "en" for English or "grc" for Koine/Biblical Greek)

Output a KrDocument with exactly this shape:

{
  "schemaVersion": 1,
  "id": "doc_paste",
  "title": "<short title>",
  "language": "<en|grc>",
  "text": "<the original sentence>",
  "notes": "",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "layoutHints": {},
  "tokens": [ /* one per surface word, in order */ ],
  "syntax": { "rootId": "<id>", "nodes": [ ... ], "relations": [ ... ] }
}

TOKEN = { "id", "index" (0-based), "surface", "lemma"?, "pos"?, "gloss"?, "morphology"?, "language"? }
  pos is one of:
${wrap(PartOfSpeechSchema.options)}
  morphology (Greek; optional; ONLY these keys are allowed):
${morph}

NODE = { "id", "kind" (word|phrase|clause), "role"?, "clauseType"?, "tokenIds": [ ... ], "implied"?, "label"? }
  clauseType (only when kind = "clause") is one of:
${wrap(ClauseTypeSchema.options)}
  tokenIds may be empty (implied element -> set "implied": true and a "label"
    such as "(he)") and need not be contiguous (discontinuous constituent).

RELATION = { "id", "type", "headId", "dependentId", "label"? }
  type is one of:
${wrap(SyntacticRoleSchema.options)}

ATTACHMENT RULES (critical):
  1. rootId is a "clause" node with empty tokenIds.
  2. "subject" and "predicate" attach to the ROOT CLAUSE.
  3. Objects/complements (directObject, predicateNominative, ...) attach to the
     PREDICATE (verb) node, NOT the clause.
  4. Modifiers (determiner, adjectival, adverbial, genitive) attach to the WORD
     they modify.
  5. Prepositional phrase: make a node for the preposition with
     role "prepositionalPhrase" attached to its head; its object is a child
     node with role "prepositionObject".
  6. Relative/subordinate clauses are kind "clause" nodes attached via
     adjectival / adverbial / complement.
  7. DO NOT use word order to decide structure — use case/agreement for Greek.
     Implied subjects and omitted copulas are nodes with tokenIds: [].
  8. Every headId/dependentId must reference an existing node id; every entry in
     tokenIds must reference an existing token id.

${WORKED_EXAMPLE}

Return only the JSON object. Then paste it into the app's JSON tab and click
Apply. If Apply reports a schema error, the message names the exact field/path —
paste that error back and ask for a corrected JSON.
`;
}
