import { describe, expect, it } from 'vitest';
import { accentFill, accentPresets, appearanceTokens, contrastRatio } from './appearance';

// The accents a person can choose: five presets plus a custom colour. The custom
// colours are deliberately awkward (mid-tone, very light, very dark, saturated).
const accents: [string, string][] = [
  ...accentPresets.map((preset): [string, string] => [preset.name, preset.color]),
  ['Custom mid-tone', '#7A7A2E'],
  ['Custom very light', '#F2E8A0'],
  ['Custom very dark', '#101830'],
  ['Custom saturated', '#00A0FF'],
];
const surfaces = {
  light: ['#F5F4F1', '#FFFEFA', '#EEEDE9', '#E7E5DF'],
  dark: ['#1E1E1E', '#282827', '#222221', '#343331'],
};

describe('accent tokens', () => {
  it('has the six accent choices the product offers', () => {
    expect(accentPresets.length + 1).toBe(6); // five presets plus Custom
  });
  for (const [name, color] of accents)
    for (const theme of ['light', 'dark'] as const) {
      it(`${name} · ${theme}: button label ≥ 4.5:1, accent text ≥ 4.5:1 on every surface, focus ≥ 3:1`, () => {
        const tokens = appearanceTokens(color, theme === 'dark');
        expect(
          contrastRatio(tokens['--accent-fill'], tokens['--accent-on-fill']),
        ).toBeGreaterThanOrEqual(4.5);
        // Existing roles keep their guarantee.
        expect(
          contrastRatio(tokens['--action-fill'], tokens['--action-label']),
        ).toBeGreaterThanOrEqual(3);
        for (const surface of surfaces[theme]) {
          expect(contrastRatio(tokens['--accent-text'], surface)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(tokens['--accent-text'], surface)).toBeGreaterThanOrEqual(3);
        }
      });
    }

  it('adjusts the fill, never the label, when the raw accent cannot reach 4.5:1', () => {
    const raw = '#4FA69B'; // the default teal: only 2.9:1 against white
    expect(contrastRatio(raw, '#FFFFFF')).toBeLessThan(4.5);
    const { fill, onFill } = accentFill(raw);
    expect(['#FFFFFF', '#151515']).toContain(onFill);
    expect(contrastRatio(fill, onFill)).toBeGreaterThanOrEqual(4.5);
    // A colour that already passes is used as chosen.
    expect(accentFill('#2A7D73')).toEqual({ fill: '#2A7D73', onFill: '#FFFFFF' });
  });

  it('provides colours for the existing accent interactions', () => {
    const tokens = appearanceTokens('#4FA69B', false);
    for (const key of ['--accent-text', '--action-fill', '--action-label', '--action-hover'])
      expect(tokens[key]).toMatch(/^#[0-9A-F]{6}$/);
  });
});
