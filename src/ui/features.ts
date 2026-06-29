/**
 * Front-end feature flags. Kept tiny and explicit so a capability can be turned
 * off without ripping out its code — flip the flag back on when it's ready.
 */

/**
 * The touch-first EDITING UX (the Parsed/Assisted/Manual mode switch, the
 * Inspector "Edit" tab with tap-to-edit / tap-to-relate, and add/delete word).
 * Disabled for now: the current editing format isn't ideal and is being
 * reworked. With it off the app is a clean reader — diagram, source text, the
 * tap-a-word detail popover, the relations reference list, and per-passage
 * notes — and the editing code stays in place behind this flag.
 */
export const EDITING_ENABLED = false;
