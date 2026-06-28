import type { Language, PartOfSpeech } from '@/domain/schema';

/**
 * Tiny closed-class lexicons used by the heuristic rules. These are NOT a
 * parser — they are just enough to bootstrap a provisional analysis that the
 * user then corrects. Extend freely; nothing downstream assumes completeness.
 */

const EN_ARTICLES = new Set(['the', 'a', 'an']);
const EN_PREPOSITIONS = new Set([
  'over', 'under', 'in', 'on', 'at', 'to', 'from', 'with', 'without', 'of',
  'for', 'by', 'about', 'into', 'onto', 'through', 'between', 'among', 'against',
  'before', 'after', 'during', 'above', 'below', 'beside', 'near', 'upon',
]);
const EN_COORDINATORS = new Set(['and', 'or', 'but', 'nor', 'yet', 'so']);
const EN_SUBORDINATORS = new Set([
  'that', 'because', 'although', 'though', 'while', 'when', 'if', 'unless',
  'since', 'as', 'whereas', 'until', 'whether',
]);
const EN_COPULAS = new Set([
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'become', 'became',
  'becomes', 'seem', 'seems', 'seemed',
]);
const EN_PRONOUNS = new Set([
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'who', 'whom', 'which', 'this', 'that', 'these', 'those',
]);

// Greek closed classes (lemma / surface, lower-cased, accents preserved).
const GRC_ARTICLES = new Set([
  'ὁ', 'ἡ', 'τό', 'οἱ', 'αἱ', 'τά', 'τοῦ', 'τῆς', 'τῷ', 'τῇ', 'τόν', 'τήν',
  'τῶν', 'τοῖς', 'ταῖς', 'τούς', 'τάς', 'τὸ', 'τὸν', 'τὴν',
]);
const GRC_COPULAS = new Set([
  'ἦν', 'ἐστιν', 'ἐστίν', 'ἐστι', 'εἰμί', 'εἰσιν', 'εἰσίν', 'ἐσμεν', 'ἦσαν',
  'ἔσται', 'γίνεται', 'ἐγένετο', 'γέγονεν', 'ἐγένετο.',
]);
const GRC_COORDINATORS = new Set(['καί', 'καὶ', 'δέ', 'δὲ', 'ἤ', 'ἢ', 'τε', 'ἀλλά', 'ἀλλὰ']);
const GRC_PARTICLES = new Set(['μέν', 'μὲν', 'γάρ', 'γὰρ', 'οὖν', 'δή', 'δὴ', 'ἄρα']);
const GRC_PREPOSITIONS = new Set([
  'ἐν', 'εἰς', 'ἐκ', 'ἐξ', 'ἀπό', 'ἀπὸ', 'ἀπ', 'διά', 'διὰ', 'πρός', 'πρὸς',
  'ἐπί', 'ἐπὶ', 'ὑπό', 'ὑπὸ', 'ὑπέρ', 'μετά', 'μετὰ', 'κατά', 'κατὰ', 'περί',
  'περὶ', 'παρά', 'παρὰ', 'σύν', 'σὺν',
]);
const GRC_RELATIVES = new Set(['ὅς', 'ἥ', 'ὅ', 'οἵ', 'αἵ', 'ἅ', 'ὃ', 'ὃς', 'ἣ']);

/** Strips a single trailing punctuation mark and lower-cases for lookup. */
export function normalize(surface: string): string {
  return surface.replace(/[.,··;;:!?]+$/u, '').toLowerCase();
}

export interface LexiconClass {
  isArticle(w: string): boolean;
  isPreposition(w: string): boolean;
  isCoordinator(w: string): boolean;
  isSubordinator(w: string): boolean;
  isCopula(w: string): boolean;
  isPronoun(w: string): boolean;
  isParticle(w: string): boolean;
  isRelative(w: string): boolean;
  /** Best-guess POS for a surface form, or undefined if unknown. */
  guessPos(w: string): PartOfSpeech | undefined;
}

function makeClass(sets: {
  articles: Set<string>;
  prepositions: Set<string>;
  coordinators: Set<string>;
  subordinators: Set<string>;
  copulas: Set<string>;
  pronouns: Set<string>;
  particles: Set<string>;
  relatives: Set<string>;
}): LexiconClass {
  const has = (s: Set<string>, w: string) => s.has(normalize(w));
  return {
    isArticle: (w) => has(sets.articles, w),
    isPreposition: (w) => has(sets.prepositions, w),
    isCoordinator: (w) => has(sets.coordinators, w),
    isSubordinator: (w) => has(sets.subordinators, w),
    isCopula: (w) => has(sets.copulas, w),
    isPronoun: (w) => has(sets.pronouns, w),
    isParticle: (w) => has(sets.particles, w),
    isRelative: (w) => has(sets.relatives, w),
    guessPos: (w) => {
      if (has(sets.articles, w)) return 'article';
      if (has(sets.prepositions, w)) return 'preposition';
      if (has(sets.coordinators, w)) return 'conjunction';
      if (has(sets.subordinators, w)) return 'conjunction';
      if (has(sets.particles, w)) return 'particle';
      if (has(sets.pronouns, w) || has(sets.relatives, w)) return 'pronoun';
      if (has(sets.copulas, w)) return 'verb';
      return undefined;
    },
  };
}

const EN = makeClass({
  articles: EN_ARTICLES,
  prepositions: EN_PREPOSITIONS,
  coordinators: EN_COORDINATORS,
  subordinators: EN_SUBORDINATORS,
  copulas: EN_COPULAS,
  pronouns: EN_PRONOUNS,
  particles: new Set(),
  relatives: new Set(['who', 'whom', 'whose', 'which', 'that']),
});

const GRC = makeClass({
  articles: GRC_ARTICLES,
  prepositions: GRC_PREPOSITIONS,
  coordinators: GRC_COORDINATORS,
  subordinators: new Set(['ὅτι', 'ἵνα', 'ἐάν', 'εἰ', 'ὡς', 'ὅτε']),
  copulas: GRC_COPULAS,
  pronouns: new Set(),
  particles: GRC_PARTICLES,
  relatives: GRC_RELATIVES,
});

export function lexicon(language: Language): LexiconClass {
  return language === 'grc' ? GRC : EN;
}
