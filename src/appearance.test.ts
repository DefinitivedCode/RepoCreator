import { describe, expect, it, vi } from 'vitest';
import {
  accentPresets,
  applyAppearance,
  appearanceTokens,
  contrastRatio,
  normalizeHex,
  resolveAccent,
} from './appearance';

describe('appearance accents', () => {
  it('applies theme and accent tokens without replacing unrelated document styles', () => {
    const styles = new Map([['--background', '#unchanged']]);
    const root = {
      dataset: {} as Record<string, string>,
      style: { setProperty: (property: string, value: string) => styles.set(property, value) },
    };
    vi.stubGlobal('document', { documentElement: root });
    try {
      applyAppearance({ appearance: 'system', accent: 'custom', customAccent: '#123456' }, true);
      expect(root.dataset).toEqual({ appearance: 'system', accent: 'custom' });
      expect(styles.get('--primary')).toBe(appearanceTokens('#123456', true)['--primary']);
      applyAppearance({ appearance: 'light', accent: 'teal' }, true);
      expect(root.dataset.appearance).toBe('light');
      expect(styles.get('--primary')).toBe(appearanceTokens('#4FA69B', false)['--primary']);
      applyAppearance({}, false);
      expect(root.dataset.accent).toBe('copper');
      expect(styles.get('--background')).toBe('#unchanged');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('normalizes printable hex values and rejects arbitrary CSS', () => {
    expect(normalizeHex(' #abcdef ')).toBe('#ABCDEF');
    expect(normalizeHex('a1b2c3')).toBe('#A1B2C3');
    for (const invalid of [
      '',
      '#123',
      '#12345',
      'red',
      'rgb(0,0,0)',
      '#123456; color:red',
      '#GGGGGG',
    ])
      expect(normalizeHex(invalid)).toBeNull();
  });
  it('preserves the previous accent for older settings and resolves supported choices', () => {
    expect(resolveAccent()).toBe('#B87550');
    expect(resolveAccent('unknown')).toBe('#B87550');
    expect(resolveAccent('teal')).toBe('#4FA69B');
    expect(resolveAccent('custom', '#efefef')).toBe('#EFEFEF');
    expect(resolveAccent('custom', 'invalid')).toBe('#B87550');
  });
  for (const dark of [false, true]) {
    const surfaces = dark
      ? ['#1E1E1E', '#282827', '#222221', '#343331']
      : ['#F5F4F1', '#FFFEFA', '#EEEDE9', '#E7E5DF'];
    for (const color of [
      ...accentPresets.map((preset) => preset.color),
      '#000000',
      '#FFFFFF',
      '#FF0000',
      '#00FF00',
      '#0000FF',
      '#FFFF00',
      '#FEFEFE',
      '#010101',
    ]) {
      it(`keeps ${color} text, buttons, borders and focus readable in ${dark ? 'dark' : 'light'} appearance`, () => {
        const tokens = appearanceTokens(color, dark);
        for (const background of [
          ...surfaces,
          tokens['--accent-surface'],
          tokens['--accent-surface-hover'],
        ]) {
          expect(contrastRatio(tokens['--accent'], background)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(tokens['--link'], background)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(tokens['--focus'], background)).toBeGreaterThanOrEqual(3);
        }
        expect(contrastRatio(tokens['--primary-text'], tokens['--primary'])).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrastRatio(tokens['--primary-text'], tokens['--primary-hover']),
        ).toBeGreaterThanOrEqual(4.5);
        for (const background of surfaces)
          expect(contrastRatio(tokens['--accent-border'], background)).toBeGreaterThanOrEqual(3);
      });
    }
    it(`keeps semantic statuses independent of the ${dark ? 'dark' : 'light'} accent`, () => {
      const baseline = appearanceTokens('#4FA69B', dark);
      for (const preset of accentPresets) {
        const tokens = appearanceTokens(preset.color, dark);
        for (const status of ['success', 'warning', 'error']) {
          expect(tokens[`--${status}`]).toBe(baseline[`--${status}`]);
          for (const surface of surfaces)
            expect(contrastRatio(tokens[`--${status}`], surface)).toBeGreaterThanOrEqual(4.5);
          expect(
            contrastRatio(tokens[`--${status}`], tokens[`--${status}-bg`]),
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(
        new Set(['success', 'warning', 'error'].map((status) => baseline[`--${status}`])).size,
      ).toBe(3);
    });
  }
  it('uses WCAG relative luminance rather than brightness averages', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
    expect(contrastRatio('#00FF00', '#000000')).toBeGreaterThan(
      contrastRatio('#0000FF', '#000000'),
    );
  });
});
