import {
  PartOfSpeechSchema,
  SyntacticRoleSchema,
  NodeKindSchema,
  ClauseTypeSchema,
  GrammaticalCaseSchema,
  GenderSchema,
  NumberSchema,
  PersonSchema,
  TenseSchema,
  VoiceSchema,
  MoodSchema,
  DegreeSchema,
} from '@/domain/schema';

/** Enum option lists for dropdowns, derived directly from the Zod schemas so
 *  the UI can never drift from the domain. */
export const POS_OPTIONS = PartOfSpeechSchema.options;
export const ROLE_OPTIONS = SyntacticRoleSchema.options;
export const NODE_KIND_OPTIONS = NodeKindSchema.options;
export const CLAUSE_TYPE_OPTIONS = ClauseTypeSchema.options;

export const MORPH_FIELDS = [
  { key: 'case', options: GrammaticalCaseSchema.options },
  { key: 'gender', options: GenderSchema.options },
  { key: 'number', options: NumberSchema.options },
  { key: 'person', options: PersonSchema.options },
  { key: 'tense', options: TenseSchema.options },
  { key: 'voice', options: VoiceSchema.options },
  { key: 'mood', options: MoodSchema.options },
  { key: 'degree', options: DegreeSchema.options },
] as const;
