import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiagramGuideModal } from '@/ui/components/DiagramGuideModal';
import { DIAGRAM_MODES } from '@/domain/layout';
import { TONE_COLORS } from '@/domain/render';

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

  it('shows the morphology colour code with each category and its real colour', () => {
    const html = markup(true);
    for (const label of ['Finite verb', 'Participle', 'Nominative', 'Accusative', 'Genitive', 'Dative', 'Vocative']) {
      expect(html, `colour code should list "${label}"`).toContain(label);
    }
    // The swatches use the renderer's actual tone colours (so the legend can't drift).
    for (const color of Object.values(TONE_COLORS)) {
      expect(html, `colour code should use ${color}`).toContain(color);
    }
  });
});
