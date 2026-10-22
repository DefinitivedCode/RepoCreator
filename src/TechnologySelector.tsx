import { useId, useState } from 'react';
import type { ProjectTechnologies } from './types';
import {
  findTechnology,
  normalizeTechnologies,
  recommendedIgnorePresets,
  recommendedTechnologies,
  technologiesError,
  technologyCatalog,
  technologyCategories,
  technologyStacks,
} from './technologies';
import './technology-selector.css';

export function TechnologySelector({
  value,
  onChange,
  simple = false,
  idPrefix,
  ignorePresets = [],
  onIgnorePresets,
}: {
  value: ProjectTechnologies;
  onChange: (value: ProjectTechnologies) => void;
  simple?: boolean;
  idPrefix?: string;
  ignorePresets?: string[];
  onIgnorePresets?: (ids: string[]) => void;
}) {
  const generatedId = useId();
  const id = idPrefix ?? `technologies-${generatedId}`;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const count = value.ids.length + value.custom.length;
  const toggle = (technology: string) =>
    onChange({
      ...value,
      ids: value.ids.includes(technology)
        ? value.ids.filter((selected) => selected !== technology)
        : [...value.ids, technology],
    });
  const suggestions = recommendedTechnologies(value);
  const ignores = recommendedIgnorePresets(value).filter(
    (preset) => !ignorePresets.includes(preset),
  );
  const matches = technologyCatalog.filter(
    (technology) =>
      (!category || technology.category === category) &&
      `${technology.name} ${technology.aliases.join(' ')}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="technology-selector">
      <div className="field-label-row">
        <label htmlFor={`${id}-quick`}>Technologies</label>
        {count > 0 && (
          <button
            type="button"
            className="text-button"
            onClick={() => onChange({ ids: [], custom: [] })}
          >
            Clear all
          </button>
        )}
      </div>
      <select
        id={`${id}-quick`}
        value=""
        onChange={(event) => {
          if (event.target.value) toggle(event.target.value);
        }}
      >
        <option value="">
          {count ? `${count} selected · add technology` : 'Choose technologies (optional)'}
        </option>
        {[
          'typescript',
          'javascript',
          'python',
          'rust',
          'csharp',
          'react',
          'vite',
          'tauri',
          'sqlite',
          'cloudflare-workers',
        ]
          .map((technology) => findTechnology(technology)!)
          .filter((technology) => !value.ids.includes(technology.id))
          .map((technology) => (
            <option key={technology.id} value={technology.id}>
              {technology.name}
            </option>
          ))}
      </select>
      {count > 0 && (
        <div className="technology-chips" aria-label="Selected technologies">
          {value.ids.map((technology) => (
            <button
              type="button"
              key={technology}
              className="technology-chip"
              aria-label={`Remove ${findTechnology(technology)?.name ?? technology}`}
              onClick={() => toggle(technology)}
            >
              {findTechnology(technology)?.name ?? technology}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {value.custom.map((label) => (
            <button
              type="button"
              key={label}
              className="technology-chip"
              title={label}
              aria-label={`Remove ${label}`}
              onClick={() =>
                onChange({
                  ...value,
                  custom: value.custom.filter((selected) => selected !== label),
                })
              }
            >
              <span className="technology-chip-label">{label}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      <details className="technology-advanced">
        <summary>{simple ? 'All technologies & stacks' : 'Technology catalogue & stacks'}</summary>
        <div className="technology-editor">
          <p className="help">
            Planning context only. Choose technologies for any component; nothing is installed.
          </p>
          <label className="field">
            <span>Stack preset</span>
            <select
              aria-label="Technology stack preset"
              value=""
              onChange={(event) => {
                const stack = technologyStacks.find((entry) => entry.id === event.target.value);
                if (stack)
                  onChange(
                    normalizeTechnologies({
                      ids: [...value.ids, ...stack.ids],
                      custom: value.custom,
                    }),
                  );
              }}
            >
              <option value="">Add a common stack…</option>
              {technologyStacks.map((stack) => (
                <option key={stack.id} value={stack.id}>
                  {stack.name}
                </option>
              ))}
            </select>
          </label>
          <div className="technology-filters">
            <label className="field">
              <span className="sr-only">Search technologies</span>
              <input
                type="search"
                aria-label="Search technologies"
                placeholder="Search technologies…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="sr-only">Technology category</span>
              <select
                aria-label="Technology category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">All categories</option>
                {technologyCategories.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="technology-results" role="group" aria-label="Technology catalogue">
            {matches.map((technology) => (
              <button
                type="button"
                key={technology.id}
                aria-pressed={value.ids.includes(technology.id)}
                onClick={() => toggle(technology.id)}
              >
                {value.ids.includes(technology.id) && <span aria-hidden="true">✓ </span>}
                {technology.name}
              </button>
            ))}
            {!matches.length && (
              <p className="help">No matching technologies. Add your own label below.</p>
            )}
          </div>
          {!!suggestions.length && (
            <div className="technology-recommendations">
              <span className="help">Often used together</span>
              {suggestions.map((technology) => (
                <button type="button" key={technology.id} onClick={() => toggle(technology.id)}>
                  + {technology.name}
                </button>
              ))}
            </div>
          )}
          <label className="field" htmlFor={`${id}-custom`}>
            Custom technology
          </label>
          <div className="inline-actions">
            <input
              id={`${id}-custom`}
              value={custom}
              maxLength={120}
              placeholder="Your technology label"
              onChange={(event) => {
                setCustom(event.target.value);
                setError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  document.getElementById(`${id}-add`)?.click();
                }
              }}
            />
            <button
              id={`${id}-add`}
              type="button"
              disabled={!custom.trim()}
              onClick={() => {
                const next = normalizeTechnologies({ ...value, custom: [...value.custom, custom] });
                const issue = technologiesError(next);
                if (issue) setError(issue);
                else {
                  onChange(next);
                  setCustom('');
                  setError('');
                }
              }}
            >
              Add
            </button>
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {onIgnorePresets && ignores.length > 0 && (
            <button
              type="button"
              className="technology-ignore-action"
              onClick={() => onIgnorePresets([...new Set([...ignorePresets, ...ignores])])}
            >
              Add matching .gitignore presets ({ignores.length})
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
