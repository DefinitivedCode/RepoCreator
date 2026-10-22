import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
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
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const count = value.ids.length + value.custom.length;
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      search.current?.focus();
    } else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const toggle = (technology: string) =>
    onChange({
      ...value,
      ids: value.ids.includes(technology)
        ? value.ids.filter((selected) => selected !== technology)
        : [...value.ids, technology],
    });
  const addCustom = () => {
    const next = normalizeTechnologies({ ...value, custom: [...value.custom, custom] });
    const issue = technologiesError(next);
    if (issue) setError(issue);
    else {
      onChange(next);
      setCustom('');
      setError('');
    }
  };
  const chips = (inDialog = false) => (
    <div
      className={`technology-chips${inDialog ? ' technology-dialog-chips' : ''}`}
      aria-label={inDialog ? 'Technologies selected in picker' : 'Selected technologies'}
    >
      {value.ids.map((technology) => (
        <button
          type="button"
          key={technology}
          className="technology-chip"
          aria-label={`Remove ${findTechnology(technology)?.name ?? technology}`}
          onClick={() => toggle(technology)}
        >
          {findTechnology(technology)?.name ?? technology}
          <Icon name="close" size={11} />
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
            onChange({ ...value, custom: value.custom.filter((selected) => selected !== label) })
          }
        >
          <span className="technology-chip-label">{label}</span>
          <Icon name="close" size={11} />
        </button>
      ))}
      {!count && inDialog && (
        <span className="help">Choose technologies for any part of your project.</span>
      )}
    </div>
  );
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
    <div className="technology-selector" data-simple={simple}>
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
      <div className="technology-compact-controls">
        <select
          id={`${id}-quick`}
          value=""
          onChange={(event) => {
            if (event.target.value) toggle(event.target.value);
          }}
        >
          <option value="">
            {count ? `${count} selected · add more` : 'Add a common technology'}
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
        <button
          ref={trigger}
          type="button"
          className="technology-browse"
          aria-label="Browse technologies"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          Browse…
        </button>
      </div>
      {count > 0 && chips()}
      {createPortal(
        <dialog
          ref={dialog}
          className="technology-dialog"
          aria-labelledby={`${id}-title`}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClose={close}
        >
          <div className="technology-dialog-header">
            <div>
              <h2 id={`${id}-title`}>Choose technologies</h2>
              <p>Project context · nothing is installed</p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close technology picker"
              onClick={close}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="technology-dialog-toolbar">
            <label className="technology-search">
              <Icon name="code" size={16} />
              <span className="sr-only">Search technologies</span>
              <input
                ref={search}
                type="search"
                aria-label="Search technologies"
                placeholder="Search all 63 technologies…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
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
              <option value="">Add a stack preset…</option>
              {technologyStacks.map((stack) => (
                <option key={stack.id} value={stack.id}>
                  {stack.name}
                </option>
              ))}
            </select>
          </div>
          <div className="technology-dialog-body">
            <nav className="technology-categories" aria-label="Technology categories">
              <button type="button" aria-pressed={!category} onClick={() => setCategory('')}>
                All technologies<span>{technologyCatalog.length}</span>
              </button>
              {technologyCategories.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  aria-pressed={category === entry.id}
                  onClick={() => setCategory(entry.id)}
                >
                  {entry.name}
                  <span>
                    {
                      technologyCatalog.filter((technology) => technology.category === entry.id)
                        .length
                    }
                  </span>
                </button>
              ))}
            </nav>
            <div
              className="technology-catalogue-scroll"
              tabIndex={0}
              aria-label="Technology catalogue"
            >
              {!query && suggestions.length > 0 && (
                <section
                  className="technology-recommendations"
                  aria-label="Recommended technologies"
                >
                  <h3>Often used together</h3>
                  <div>
                    {suggestions.map((technology) => (
                      <button
                        type="button"
                        key={technology.id}
                        onClick={() => toggle(technology.id)}
                      >
                        + {technology.name}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {technologyCategories.map((entry) => {
                const entries = matches.filter((technology) => technology.category === entry.id);
                return entries.length ? (
                  <section
                    className="technology-category-group"
                    key={entry.id}
                    aria-label={entry.name}
                  >
                    <h3>{entry.name}</h3>
                    <div className="technology-results">
                      {entries.map((technology) => (
                        <button
                          type="button"
                          key={technology.id}
                          aria-pressed={value.ids.includes(technology.id)}
                          onClick={() => toggle(technology.id)}
                        >
                          <span>{technology.name}</span>
                          {value.ids.includes(technology.id) ? (
                            <Icon name="check" size={14} />
                          ) : (
                            <span className="technology-add" aria-hidden="true">
                              +
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null;
              })}
              {!matches.length && (
                <div className="technology-empty">
                  <h3>No matching technologies</h3>
                  <p>Add a custom label below, or try another search.</p>
                </div>
              )}
            </div>
          </div>
          <div className="technology-selection-summary">
            <span>{count} selected</span>
            {chips(true)}
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
          <div className="technology-custom-row">
            <label className="sr-only" htmlFor={`${id}-custom`}>
              Custom technology
            </label>
            <input
              id={`${id}-custom`}
              value={custom}
              maxLength={120}
              placeholder="Add a custom technology…"
              onChange={(event) => {
                setCustom(event.target.value);
                setError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && custom.trim()) {
                  event.preventDefault();
                  addCustom();
                }
              }}
            />
            <button type="button" disabled={!custom.trim()} onClick={addCustom}>
              Add custom
            </button>
          </div>
          {error && (
            <p className="technology-error inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="technology-dialog-footer">
            <div>
              {onIgnorePresets && ignores.length > 0 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onIgnorePresets([...new Set([...ignorePresets, ...ignores])])}
                >
                  Add matching .gitignore presets ({ignores.length})
                </button>
              )}
            </div>
            <button type="button" className="primary" onClick={close}>
              Done
            </button>
          </div>
        </dialog>,
        document.body,
      )}
    </div>
  );
}
