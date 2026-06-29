import { describe, it, expect, beforeEach } from 'vitest';
import { classifyWidth, loadForceDesktop, saveForceDesktop } from '@/ui/responsive';

describe('viewport classification', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('classifies widths into mobile/tablet/desktop bands', () => {
    expect(classifyWidth(360)).toBe('mobile');
    expect(classifyWidth(767)).toBe('mobile');
    expect(classifyWidth(768)).toBe('tablet');
    expect(classifyWidth(1023)).toBe('tablet');
    expect(classifyWidth(1024)).toBe('desktop');
    expect(classifyWidth(1920)).toBe('desktop');
  });

  it('persists the force-desktop preference', () => {
    expect(loadForceDesktop()).toBe(false);
    saveForceDesktop(true);
    expect(loadForceDesktop()).toBe(true);
    saveForceDesktop(false);
    expect(loadForceDesktop()).toBe(false);
  });
});
