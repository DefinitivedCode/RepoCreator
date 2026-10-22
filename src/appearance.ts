/** Accent choices are raw swatches. UI roles derive a contrast-safe shade for each theme. */
export const accentPresets = [
  { id: 'slate', name: 'Slate', color: '#718096' },
  { id: 'teal', name: 'Muted Teal', color: '#4FA69B' },
  { id: 'gold', name: 'Muted Gold', color: '#B29A57' },
  { id: 'copper', name: 'Copper', color: '#B87550' },
  { id: 'monochrome', name: 'Monochrome', color: '#808080' },
] as const;

export type AccentId = (typeof accentPresets)[number]['id'] | 'custom';
type RGB = [number, number, number];
interface AppearancePreferences {
  appearance?: 'system' | 'light' | 'dark';
  accent?: string;
  customAccent?: string;
}

export function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, '');
  if (/^[\da-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`;
  return null;
}

export function resolveAccent(accent?: string, customAccent?: string): string {
  const legacy = accentPresets.find((preset) => preset.id === 'copper')!.color;
  if (accent === 'custom') return normalizeHex(customAccent ?? '') ?? legacy;
  return accentPresets.find((preset) => preset.id === accent)?.color ?? legacy;
}

function rgb(hex: string): RGB {
  const value = normalizeHex(hex) ?? '#000000';
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as RGB;
}
function hex(channels: RGB): string {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
function mix(from: string, to: string, amount: number): string {
  const left = rgb(from),
    right = rgb(to);
  return hex(left.map((channel, index) => channel + (right[index] - channel) * amount) as RGB);
}
function luminance(color: string): number {
  const linear = rgb(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
export function contrastRatio(first: string, second: string): number {
  const left = luminance(first),
    right = luminance(second);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}
function readableShade(color: string, backgrounds: string[], dark: boolean, minimum = 4.5): string {
  const passes = (candidate: string) =>
    backgrounds.every((background) => contrastRatio(candidate, background) >= minimum);
  if (passes(color)) return color;
  const endpoint = dark ? '#FFFFFF' : '#000000';
  let low = 0,
    high = 1;
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (passes(mix(color, endpoint, middle))) high = middle;
    else low = middle;
  }
  return mix(color, endpoint, high);
}

/** Text, selected states, button fills and focus outlines share a hue, not a raw colour. */
export function appearanceTokens(color: string, dark: boolean): Record<string, string> {
  const raw = normalizeHex(color) ?? '#4FA69B';
  const surfaces = dark
    ? ['#1E1E1E', '#282827', '#222221', '#343331']
    : ['#F5F4F1', '#FFFEFA', '#EEEDE9', '#E7E5DF'];
  const selected = mix(surfaces[1], raw, dark ? 0.14 : 0.09);
  const selectedHover = mix(surfaces[1], raw, dark ? 0.2 : 0.14);
  const text = readableShade(raw, [...surfaces, selected, selectedHover], dark);
  const border = readableShade(raw, [...surfaces, selected], dark, 3);
  const foreground =
    contrastRatio(text, '#FFFFFF') >= contrastRatio(text, '#151515') ? '#FFFFFF' : '#151515';
  const hover = mix(text, dark ? '#FFFFFF' : '#000000', 0.09);
  return {
    '--accent-raw': raw,
    '--accent': text,
    '--accent-text': text,
    '--accent-border': border,
    '--accent-surface': selected,
    '--accent-surface-hover': selectedHover,
    '--selected-background': selected,
    '--selected-text': text,
    '--selected-border': border,
    '--primary': text,
    '--primary-hover': hover,
    '--primary-text': foreground,
    '--primary-border': text,
    '--link': text,
    '--focus': text,
    '--success': dark ? '#7DC59C' : '#267046',
    '--success-bg': dark ? '#24332A' : '#EDF6EF',
    '--warning': dark ? '#E3B95F' : '#835D13',
    '--warning-bg': dark ? '#383020' : '#FBF3DF',
    '--error': dark ? '#FFA99B' : '#A33023',
    '--error-bg': dark ? '#352624' : '#FFF2ED',
  };
}

/** The React preference effect owns system-theme change subscriptions. */
export function applyAppearance(preferences: AppearancePreferences, systemDark: boolean): void {
  const appearance = preferences.appearance ?? 'system';
  const dark = appearance === 'dark' || (appearance === 'system' && systemDark);
  document.documentElement.dataset.appearance = appearance;
  document.documentElement.dataset.accent =
    preferences.accent &&
    ['custom', ...accentPresets.map((preset) => preset.id)].includes(preferences.accent)
      ? preferences.accent
      : 'copper';
  const tokens = appearanceTokens(
    resolveAccent(preferences.accent, preferences.customAccent),
    dark,
  );
  for (const [property, value] of Object.entries(tokens))
    document.documentElement.style.setProperty(property, value);
}
