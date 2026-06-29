/**
 * On-device error log — a diagnostic for the iOS pinch white-screen.
 *
 * The phone has no dev console, and the failure (a pinch blanks the whole page)
 * is invisible from the outside: we cannot tell a JavaScript crash that unmounts
 * React apart from a WebKit compositor blank where the DOM is fine but nothing
 * paints. So capture every JS error to localStorage — surviving the blank and
 * the reload that follows — and surface it on the next load. If the screen goes
 * white and a captured error appears afterwards, it was JS (and we see exactly
 * what); if it goes white with the log empty, it was the compositor.
 */
const KEY = 'kr:errorlog';
const MAX = 12;

/**
 * Build marker — bump this string every deploy. Shown in the DiagnosticsBanner so
 * we can confirm the phone is actually running THIS build and not an old
 * service-worker-cached one (a `prompt`-type PWA serves stale assets until the
 * update is accepted, which would make "no banner" meaningless).
 */
export const BUILD_ID = 'trace-1';

export interface LoggedError {
  t: string;
  msg: string;
  stack?: string;
}

/**
 * Gesture breadcrumb trail. localStorage writes flush synchronously, so a trail
 * written step-by-step survives even a native WebContent-process crash (which
 * throws no JS error). After a blank+reload, the LAST breadcrumb is the operation
 * that killed the process — the one thing four blind fixes lacked.
 */
const TRACE_KEY = 'kr:trace';
const TRACE_MAX = 60;

export interface Crumb {
  t: number;
  msg: string;
}

export function breadcrumb(msg: string): void {
  try {
    const list = readTrace();
    const t = typeof performance !== 'undefined' ? performance.now() : 0;
    list.push({ t: Math.round(t), msg });
    while (list.length > TRACE_MAX) list.shift();
    localStorage.setItem(TRACE_KEY, JSON.stringify(list));
  } catch {
    /* best-effort */
  }
}

export function readTrace(): Crumb[] {
  try {
    const raw = localStorage.getItem(TRACE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Crumb[]) : [];
  } catch {
    return [];
  }
}

export function clearTrace(): void {
  try {
    localStorage.removeItem(TRACE_KEY);
  } catch {
    /* ignore */
  }
}

export function logError(msg: string, stack?: string): void {
  try {
    const list = readErrors();
    list.push({ t: new Date().toISOString(), msg, stack });
    while (list.length > MAX) list.shift();
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* localStorage unavailable (private mode quota, etc.) — diagnostics are best-effort. */
  }
}

export function readErrors(): LoggedError[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as LoggedError[]) : [];
  } catch {
    return [];
  }
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Capture errors that never reach a React error boundary — those thrown from
 *  event handlers (the pinch/pointer path), async callbacks, and rejected
 *  promises. Installed once at startup. */
export function installGlobalErrorLog(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    const err = e.error as Error | undefined;
    logError(err?.message || e.message || 'error', err?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    logError('unhandledrejection: ' + (r?.message || String(r)), r?.stack);
  });
}
