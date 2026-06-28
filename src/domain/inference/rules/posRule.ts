import { lexicon } from '../lexicon';
import type { InferenceRule } from '../types';

/**
 * Proposes a part of speech for tokens that lack one, using the closed-class
 * lexicons. Content words it cannot classify are left for the user. Every
 * suggestion is its own inference so it can be accepted/rejected individually.
 */
export const posRule: InferenceRule = {
  name: 'part-of-speech',
  description: 'Guess parts of speech for unlabelled tokens from closed-class lexicons.',
  run: ({ doc, nextId }) => {
    const lex = lexicon(doc.language);
    return doc.tokens
      .filter((t) => !t.pos)
      .map((t) => ({ token: t, pos: lex.guessPos(t.surface) }))
      .filter((x): x is { token: typeof x.token; pos: NonNullable<typeof x.pos> } =>
        Boolean(x.pos),
      )
      .map(({ token, pos }) => ({
        id: nextId('inf'),
        title: `${token.surface} → ${pos}`,
        category: 'pos' as const,
        provenance: {
          source: 'inferred' as const,
          confidence: 'medium' as const,
          reason: `Closed-class lexicon match for "${token.surface}".`,
        },
        tokenIds: [token.id],
        ops: [{ op: 'updateToken' as const, tokenId: token.id, patch: { pos } }],
      }));
  },
};
