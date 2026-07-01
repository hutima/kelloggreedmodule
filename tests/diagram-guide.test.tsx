import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiagramGuideModal } from '@/ui/components/DiagramGuideModal';
import { DIAGRAM_MODES } from '@/domain/layout';

/**
 * The "how to read the diagram" reference is presentation-only, so we just pin
 * that it covers every visualization and the Kellogg-Reed marks people ask about,
 * and that it renders nothing when closed.
 */
const markup = (open: boolean) =>
  renderToStaticMarkup(createElement(DiagramGuideModal, { open, onClose: () => {} }));

describe('DiagramGuideModal', () => {
  it('renders nothing when closed', () => {
    expect(markup(false)).toBe('');
  });

  it('documents every visualization mode', () => {
    const html = markup(true);
    for (const m of DIAGRAM_MODES) {
      expect(html, `guide should mention "${m.label}"`).toContain(m.label);
    }
  });

  it('explains the core Kellogg-Reed marks', () => {
    const html = markup(true);
    for (const mark of [
      'Subject | predicate',
      'Direct / indirect object',
      'Predicate noun / adjective',
      'Prepositional phrase',
      'Subordinate / relative clause',
      'Coordination',
      'Apposition',
      'Infinitive',
      'Implied / elided word',
    ]) {
      expect(html, `guide should explain "${mark}"`).toContain(mark);
    }
    // The marks are drawn, not just described.
    expect(html).toContain('<svg');
  });
});
