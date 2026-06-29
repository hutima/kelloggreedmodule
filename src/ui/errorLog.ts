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

export interface LoggedError {
  t: string;
  msg: string;
  stack?: string;
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
