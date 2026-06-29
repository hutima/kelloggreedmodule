import { customAlphabet } from 'nanoid';

// Short, URL-safe, collision-resistant ids. Prefixed by entity kind so ids are
// self-describing in JSON exports and easier to debug.
const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const nano = customAlphabet(alphabet, 8);

export type IdPrefix =
  | 'doc'
  | 'tok'
  | 'node'
  | 'rel'
  | 'inf'
  // sermon-prep entities
  | 'note'
  | 'hl'
  | 'obs'
  | 'sec';

export function makeId(prefix: IdPrefix): string {
  return `${prefix}_${nano()}`;
}
