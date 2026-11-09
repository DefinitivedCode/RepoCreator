import { Button, InlineProblem } from './ui';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Icon } from './icons';
import type { Creator } from './useCreator';
import type { AppError } from './types';
import { accentPresets, appearanceTokens, normalizeHex, resolveAccent } from './appearance';
import './appearance-settings.css';

const customHex = (value: string) =>
  /^#[\da-f]{6}$/i.test(value.trim()) ? normalizeHex(value) : null;

export function AppearanceSettings({ creator }: { creator: Creator }) {
  const preferences = creator.preferences!;
  const selectedAccent = preferences.accent ?? 'copper';
  const customAccent = preferences.customAccent ?? '#4FA69B';
  const [draft, setDraft] = useState(customAccent);
  const latestSave = useRef({ theme: 0, accent: 0 });
  const [saving, setSaving] = useState<
    Partial<Record<'theme' | 'accent', AppError | 'pending' | null>>
  >({});
  async function save(kind: 'theme' | 'accent', apply: () => Promise<AppError | null>) {
    const request = ++latestSave.current[kind];
    setSaving((state) => ({ ...state, [kind]: 'pending' }));
    const result = await apply();
    if (request === latestSave.current[kind]) setSaving((state) => ({ ...state, [kind]: result }));
  }
  function saveTheme(theme: Parameters<Creator['appearance']>[0]) {
    void save('theme', () => creator.appearance(theme));
  }
  function saveAccent(accent: Parameters<Creator['accent']>[0], color: string) {
    void save('accent', () => creator.accent(accent, color));
  }
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const id = useId();
  useEffect(() => {
    setDraft(customAccent);
  }, [customAccent]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const color = customHex(draft);
  const invalid = !color;
  const dark =
    preferences.appearance === 'dark' || (preferences.appearance === 'system' && systemDark);
  const previewTokens = appearanceTokens(resolveAccent(selectedAccent, customAccent), dark);
  const updateCustom = (value: string) => {
    const normalized = customHex(value);
    setDraft(normalized ?? value);
    if (normalized) saveAccent('custom', normalized);
  };
  return (
    <div className="appearance-settings">
      <div className="appearance-controls">
        <fieldset className="appearance-fieldset">
          <legend>Theme</legend>
          <div className="appearance-theme-options">
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <label
                className="appearance-theme-choice"
                data-selected={preferences.appearance === theme}
                key={theme}
              >
                <input
                  type="radio"
                  name={`${id}-theme`}
                  value={theme}
                  checked={preferences.appearance === theme}
                  onChange={() => saveTheme(theme)}
                />
                <span>{theme[0].toUpperCase() + theme.slice(1)}</span>
              </label>
            ))}
          </div>
          {saving.theme === 'pending' ? (
            <p className="help" role="status">
              Saving theme…
            </p>
          ) : (
            saving.theme && (
              <InlineProblem
                error={saving.theme}
                action={
                  <Button
                    size="compact"
                    onClick={() => saveTheme(preferences.appearance ?? 'system')}
                  >
                    Retry saving theme
                  </Button>
                }
              />
            )
          )}
        </fieldset>
        <fieldset className="appearance-fieldset">
          <legend>Accent color</legend>
          <div className="appearance-accent-options">
            {accentPresets.map((preset) => (
              <label
                className="appearance-accent-choice"
                key={preset.id}
                data-selected={selectedAccent === preset.id}
              >
                <input
                  type="radio"
                  name={`${id}-accent`}
                  checked={selectedAccent === preset.id}
                  onChange={() => saveAccent(preset.id, customAccent)}
                />
                <span
                  className="appearance-color-swatch"
                  style={{ background: preset.color }}
                  aria-hidden="true"
                />
                <span>{preset.name}</span>
                <Icon name="check" size={13} />
              </label>
            ))}
            <label className="appearance-accent-choice" data-selected={selectedAccent === 'custom'}>
              <input
                type="radio"
                name={`${id}-accent`}
                checked={selectedAccent === 'custom'}
                onChange={() => {
                  setDraft(customAccent);
                  saveAccent('custom', customAccent);
                }}
              />
              <span
                className="appearance-color-swatch"
                style={{ background: customAccent }}
                aria-hidden="true"
              />
              <span>Custom</span>
              <Icon name="check" size={13} />
            </label>
          </div>
        </fieldset>
        <div className="appearance-custom-controls">
          <label className="appearance-native-picker">
            <span className="sr-only">Custom accent color</span>
            <input
              type="color"
              aria-label="Custom accent color"
              value={color ?? customAccent}
              onChange={(event) => updateCustom(event.target.value)}
            />
          </label>
          <label className="field appearance-hex-field">
            <span>Hex color</span>
            <input
              value={draft}
              aria-invalid={invalid}
              aria-describedby={invalid ? `${id}-error` : undefined}
              placeholder="#4FA69B"
              spellCheck={false}
              autoComplete="off"
              maxLength={7}
              onChange={(event) => updateCustom(event.target.value)}
            />
          </label>
        </div>
        {invalid && (
          <p id={`${id}-error`} className="appearance-validation inline-error" role="alert">
            Enter a six-digit hex color, for example #4FA69B.
          </p>
        )}
        {saving.accent === 'pending' ? (
          <p className="help" role="status">
            Saving accent…
          </p>
        ) : (
          saving.accent && (
            <InlineProblem
              error={saving.accent}
              action={
                <Button size="compact" onClick={() => saveAccent(selectedAccent, customAccent)}>
                  Retry saving accent
                </Button>
              }
            />
          )
        )}
        <div className="appearance-reset">
          <Button
            type="button"
            variant="tertiary"
            size="compact"
            onClick={() => {
              setDraft('#4FA69B');
              saveTheme('system');
              saveAccent('teal', '#4FA69B');
            }}
          >
            <Icon name="refresh" size={13} />
            Reset to default
          </Button>
          <span>System theme · Muted Teal</span>
        </div>
      </div>
      <div className="appearance-preview-column">
        <span className="appearance-preview-label">Live preview</span>
        <div
          className="appearance-preview"
          style={previewTokens as CSSProperties}
          aria-label="Appearance preview"
        >
          <div className="appearance-preview-header">
            <Icon name="repo" size={17} />
            <strong>Project workspace</strong>
          </div>
          <div className="appearance-preview-tabs">
            <span className="appearance-preview-active">Overview</span>
            <span>Commands</span>
            <span>Settings</span>
          </div>
          <div className="appearance-preview-content">
            <p className="appearance-preview-title">Field notes</p>
            <p>A place for your next project.</p>
            <div className="appearance-preview-file">
              <Icon name="file" size={15} />
              <span>README.md</span>
              <Icon name="check" size={14} />
            </div>
            <span className="appearance-preview-ready">
              <Icon name="check" size={12} />
              Ready to create
            </span>
            <button
              type="button"
              className="appearance-preview-button"
              tabIndex={-1}
              aria-disabled="true"
            >
              Open project
              <Icon name="arrow" size={14} />
            </button>
          </div>
        </div>
        <p className="appearance-preview-caption">Changes apply throughout the app.</p>
      </div>
    </div>
  );
}
