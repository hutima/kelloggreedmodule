import type { Language, Morphology } from '@/domain/schema';

/**
 * The pronoun a pro-drop clause's empty subject can be IMPUTED from its finite
 * verb's morphology. A finite verb agrees with its subject in person and number,
 * so a subjectless first/second-person verb already names its own subject even
 * when no word is written — Greek pro-drop (σπένδομαι → "(ἐγώ)"), an English
 * imperative ("(you)"). Philippians 2:17 stacks three such clauses (σπένδομαι /
 * χαίρω / συνχαίρω), all first singular, all imputing ἐγώ.
 *
 * We deliberately impute ONLY first and second person: a third-person verb points
 * at some specific nominal the morphology alone can't name (he? she? the crowd?),
 * so its subject slot keeps the generic "(subject)" filler. Returns the bare
 * pronoun (the caller adds any "(…)" framing), or undefined when nothing can be
 * safely imputed (third person, no person, or an unhandled language). Number
 * selects singular vs. plural; a dual (unattested in Koine) folds into the plural.
 */
export function impliedSubjectPronoun(
  morph: Morphology | undefined,
  language: Language,
): string | undefined {
  const person = morph?.person;
  if (person !== 'first' && person !== 'second') return undefined;
  const plural = morph?.number === 'plural' || morph?.number === 'dual';

  if (language === 'grc') {
    if (person === 'first') return plural ? 'ἡμεῖς' : 'ἐγώ';
    return plural ? 'ὑμεῖς' : 'σύ';
  }
  if (language === 'en') {
    if (person === 'first') return plural ? 'we' : 'I';
    return 'you'; // English "you" is number-neutral
  }
  // Hebrew and anything else: the pronoun choice also needs gender, so skip
  // rather than guess.
  return undefined;
}
