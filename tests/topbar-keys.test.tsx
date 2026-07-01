import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { TopBar } from '@/ui/components/TopBar';
import { useEditorStore } from '@/state';

const store = useEditorStore;

/**
 * The global Ctrl/Cmd+Z handler steps DIAGRAM history — but only outside text
 * fields. Inside an input/textarea/select/contentEditable the browser's native
 * text undo must keep working, so the handler neither fires nor preventDefaults.
 */

/** Dispatch a bubbling Ctrl+Z (or Ctrl+Shift+Z) keydown from `target`. */
function press(target: EventTarget, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key: 'z',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

describe('TopBar keyboard undo/redo', () => {
  beforeEach(() => {
    store.getState().newDocument('en', 'Kbd');
    store.getState().setTitle('One');
    store.getState().setTitle('Two');
    render(createElement(TopBar));
  });
  afterEach(cleanup);

  it('Ctrl/Cmd+Z undoes diagram history outside text fields', () => {
    const e = press(document.body);
    expect(store.getState().doc.title).toBe('One');
    expect(e.defaultPrevented).toBe(true);
  });

  it('leaves the combo to the browser inside INPUT / TEXTAREA / SELECT', () => {
    for (const tag of ['input', 'textarea', 'select'] as const) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      const e = press(el);
      expect(store.getState().doc.title, `${tag} should keep native undo`).toBe('Two');
      expect(e.defaultPrevented, `${tag} should not be preventDefaulted`).toBe(false);
    }
  });

  it('leaves the combo to the browser inside a contentEditable element', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    document.body.appendChild(el);
    const e = press(el);
    expect(store.getState().doc.title).toBe('Two');
    expect(e.defaultPrevented).toBe(false);
  });

  it('applies the same guard to redo (Ctrl/Cmd+Shift+Z)', () => {
    press(document.body); // undo → 'One'
    const input = document.createElement('input');
    document.body.appendChild(input);
    press(input, { shiftKey: true });
    expect(store.getState().doc.title).toBe('One'); // redo suppressed in the field
    press(document.body, { shiftKey: true });
    expect(store.getState().doc.title).toBe('Two'); // redo works outside it
  });
});
