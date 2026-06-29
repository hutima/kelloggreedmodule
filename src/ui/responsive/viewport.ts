/**
 * VIEWPORT / RESPONSIVE MODEL.
 *
 * Primary design principle: do not force one giant UI onto every screen. We
 * detect three device classes and a user override ("force desktop on a phone")
 * so the shell can present a distinct experience per class while sharing one
 * data model.
 */

export type ViewportKind = 'mobile' | 'tablet' | 'desktop';

/** Breakpoints (px). Tablet is the middle band; desktop is the widest. */
export const MOBILE_MAX = 767;
export const TABLET_MAX = 1023;

export function classifyWidth(width: number): ViewportKind {
  if (width <= MOBILE_MAX) return 'mobile';
  if (width <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

const FORCE_DESKTOP_KEY = 'kr:forceDesktop';

export function loadForceDesktop(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(FORCE_DESKTOP_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveForceDesktop(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) localStorage.setItem(FORCE_DESKTOP_KEY, '1');
    else localStorage.removeItem(FORCE_DESKTOP_KEY);
  } catch {
    /* ignore */
  }
}
