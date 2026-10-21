import { useRef, useState } from 'react';
import { Icon } from './icons';
import { AdvancedPanel, FilePreview, IgnorePanel } from './ConfigurationPanels';
import { PresetDialog } from './PresetDialog';
import { useCreator, type Creator } from './useCreator';
import { displayPath, formError, nameError, optionsError } from './validation';
import { stages, type Appearance, type Readme } from './types';

export default function App() {
  const creator = useCreator();
  const [presetId, setPresetId] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const { form, catalog, preferences, environment, state } = creator;
  const github = form?.destination === 'github';
  const allPresets = [...(catalog?.builtInPresets ?? []), ...(preferences?.customPresets ?? [])];
  const selectedPreset = allPresets.find((p) => p.id === presetId);
  const nameValidation = form?.name ? nameError(form.name) : null;
  const configurationError = form ? optionsError(form.options) : null;

  function createAnother() {
    creator.reset();
    requestAnimationFrame(() => nameInput.current?.focus());
  }
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <Icon name="repo" size={18} />
          <h1>Repo Creator</h1>
        </div>
        <label className="appearance-control">
          <span className="sr-only">Appearance</span>
          <select
            value={preferences?.appearance ?? 'system'}
            disabled={!preferences || creator.busy}
            onChange={(event) => void creator.appearance(event.target.value as Appearance)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>

      {!form || !catalog || !preferences ? (
        <main className="content">
          <p className="help" role="status">
            {creator.notice || creator.error?.message || 'Loading settings…'}
          </p>
        </main>
      ) : state.kind === 'form' ? (
        <form
          className="creation-form"
          onSubmit={(event) => {
            event.preventDefault();
            void creator.execute();
          }}
        >
          <main className="content" tabIndex={0} aria-label="Repository configuration">
            <div className="content-inner">
              <div className="section-title">
                <h2>New repository</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    creator.configure(catalog.defaultConfiguration);
                    setPresetId('default');
                  }}
                >
                  Reset configuration
                </button>
              </div>
              <fieldset disabled={creator.picking} className="main-fields">
                <div className="field">
                  <label htmlFor="project-name">Project name</label>
                  <input
                    ref={nameInput}
                    autoFocus
                    id="project-name"
                    value={form.name}
                    placeholder="my-project"
                    maxLength={101}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!!nameValidation}
                    aria-describedby={nameValidation ? 'name-error' : undefined}
                    onChange={(event) => creator.update('name', event.target.value)}
                  />
                  {nameValidation && (
                    <p id="name-error" className="inline-error">
                      {nameValidation}
                    </p>
                  )}
                </div>

                <div className="field">
                  <label id="destination-label">Destination</label>
                  <div className="destination-row">
                    <div className="segmented" role="group" aria-labelledby="destination-label">
                      <button
                        type="button"
                        aria-pressed={!github}
                        onClick={() => void creator.destination('local')}
                      >
                        <Icon name="folder" size={14} />
                        Local only
                      </button>
                      <button
                        type="button"
                        aria-pressed={!!github}
                        onClick={() => void creator.destination('github')}
                      >
                        <Icon name="github" size={14} />
                        GitHub
                      </button>
                    </div>
                    {github && (
                      <div
                        className="visibility"
                        role="radiogroup"
                        aria-label="Repository visibility"
                      >
                        <label>
                          <input
                            type="radio"
                            name="visibility"
                            checked={form.visibility === 'private'}
                            onChange={() => creator.update('visibility', 'private')}
                          />
                          Private
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="visibility"
                            checked={form.visibility === 'public'}
                            onChange={() => creator.update('visibility', 'public')}
                          />
                          Public
                        </label>
                      </div>
                    )}
                  </div>
                </div>
                {github && (
                  <div className="field owner-field">
                    <label htmlFor="github-owner">Owner</label>
                    <select
                      id="github-owner"
                      value={form.githubOwner || environment?.githubUser || ''}
                      disabled={!environment?.githubUser}
                      onChange={(event) => creator.update('githubOwner', event.target.value)}
                    >
                      {!environment?.githubUser && (
                        <option value="">Connect to GitHub first</option>
                      )}
                      {(environment?.githubOwners ?? []).map((owner) => (
                        <option key={owner} value={owner}>
                          {owner}
                          {owner === environment?.githubUser ? ' (personal)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="connection-line">
                      <span className="help">
                        {environment?.githubUser
                          ? `Signed in as ${environment.githubUser}`
                          : 'Not connected'}
                      </span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => void creator.refresh(true)}
                        disabled={creator.checking}
                      >
                        {creator.checking ? 'Checking…' : 'Check connection'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="field">
                  <label htmlFor="description">
                    Description{' '}
                    <span aria-hidden="true" className="optional">
                      optional
                    </span>
                  </label>
                  <textarea
                    id="description"
                    rows={2}
                    value={form.description}
                    placeholder="What is this project for?"
                    maxLength={700}
                    aria-invalid={Array.from(form.description).length > 350}
                    onChange={(event) => creator.update('description', event.target.value)}
                  />
                  {Array.from(form.description).length > 350 && (
                    <p className="inline-error">Use 350 characters or fewer.</p>
                  )}
                </div>

                <div className="field">
                  <label id="location-label">Project location</label>
                  <div className="location-control">
                    <span
                      aria-labelledby="location-label"
                      title={displayPath(preferences.parentPath)}
                    >
                      {displayPath(preferences.parentPath)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void creator.chooseFolder()}
                      disabled={creator.picking}
                    >
                      {creator.picking ? 'Choosing…' : 'Browse…'}
                    </button>
                  </div>
                  <div className="location-meta">
                    <p
                      className="help path-preview"
                      title={`${displayPath(preferences.parentPath)}\\${form.name || 'my-project'}`}
                    >
                      New folder: <code>{form.name || 'my-project'}</code>
                    </p>
                    {preferences.recentLocations.length > 0 && (
                      <label className="recent-select">
                        <span className="sr-only">Recent locations</span>
                        <select
                          value=""
                          onChange={(event) => {
                            if (event.target.value !== '')
                              void creator.recentLocation(Number(event.target.value));
                          }}
                        >
                          <option value="">Recent locations</option>
                          {preferences.recentLocations.map((path, index) => (
                            <option key={path} value={index}>
                              {displayPath(path)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="project-preset">Project preset</label>
                  <div className="inline-actions">
                    <select
                      id="project-preset"
                      value={allPresets.some((p) => p.id === presetId) ? presetId : ''}
                      onChange={(event) => {
                        const preset = allPresets.find((p) => p.id === event.target.value);
                        if (preset) {
                          creator.configure(preset.configuration);
                          setPresetId(preset.id);
                        }
                      }}
                    >
                      <option value="">Last used settings</option>
                      <optgroup label="Built-in">
                        {catalog.builtInPresets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                      {preferences.customPresets.length > 0 && (
                        <optgroup label="Custom">
                          {preferences.customPresets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <button type="button" onClick={() => setPresetsOpen(true)}>
                      Manage…
                    </button>
                  </div>
                </div>

                <div className="field readme-row">
                  <label htmlFor="readme">README</label>
                  <select
                    id="readme"
                    value={form.readme}
                    onChange={(event) => creator.update('readme', event.target.value as Readme)}
                  >
                    <option value="none">None</option>
                    <option value="minimal">Minimal</option>
                    <option value="general">General</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div className="configuration-panels">
                  <IgnorePanel
                    creator={creator}
                    recommendation={selectedPreset?.configuration.options.ignorePresets}
                  />
                  <AdvancedPanel creator={creator} />
                  <FilePreview
                    files={creator.files}
                    loading={creator.previewing}
                    error={creator.previewError}
                  />
                </div>
              </fieldset>

              {environment && !creator.setupReady && <SetupPanel creator={creator} />}
              {configurationError && (
                <p className="inline-error config-error" role="status">
                  {configurationError}
                </p>
              )}
              {formError(form) && !nameError(form.name) && !configurationError && (
                <p className="inline-error config-error">{formError(form)}</p>
              )}
              {creator.error && (
                <div className="error-banner" role="alert">
                  <strong>{creator.error.message}</strong>
                  <p>{creator.error.guidance}</p>
                </div>
              )}
              {creator.notice && (
                <p className="notice" role="status">
                  {creator.notice}
                </p>
              )}
            </div>
          </main>
          <footer className="action-bar">
            <div className="status-text">
              <Icon name={creator.setupReady ? 'check' : 'alert'} size={13} />
              <span>
                {creator.checking
                  ? 'Checking setup…'
                  : creator.setupReady
                    ? github
                      ? 'Ready to publish'
                      : 'Git ready'
                    : 'Setup required'}
              </span>
            </div>
            <button type="submit" className="primary create-button" disabled={!creator.ready}>
              Create Repository <Icon name="arrow" size={14} />
            </button>
          </footer>
        </form>
      ) : (
        <RepositoryState creator={creator} onAnother={createAnother} />
      )}
      {presetsOpen && (
        <PresetDialog
          creator={creator}
          onClose={() => setPresetsOpen(false)}
          onSaved={setPresetId}
        />
      )}
    </div>
  );
}

function SetupPanel({ creator }: { creator: Creator }) {
  const { environment } = creator;
  if (!environment) return null;
  return (
    <section className="setup-panel" aria-label="Required setup">
      <Icon name="alert" size={16} />
      <div>
        {!environment.gitInstalled ? (
          <>
            <strong>Git is not installed.</strong>
            <button
              className="text-button"
              type="button"
              onClick={() => void creator.action('open_setup_resource', { resource: 'git' })}
            >
              Download Git <Icon name="external" size={12} />
            </button>
          </>
        ) : !environment.identityReady ? (
          <>
            <strong>Set your Git commit identity.</strong>
            <code className="setup-commands">
              git config --global user.name "Your Name"
              <br />
              git config --global user.email "you@example.com"
            </code>
          </>
        ) : !environment.ghInstalled ? (
          <>
            <strong>GitHub CLI is not installed.</strong>
            <button
              className="text-button"
              type="button"
              onClick={() => void creator.action('open_setup_resource', { resource: 'gh' })}
            >
              Download GitHub CLI <Icon name="external" size={12} />
            </button>
          </>
        ) : (
          <>
            <strong>Connect your GitHub account.</strong>
            <button type="button" onClick={() => void creator.connect()}>
              Connect to GitHub <Icon name="external" size={12} />
            </button>
          </>
        )}
        <button
          className="text-button"
          type="button"
          disabled={creator.checking}
          onClick={() => void creator.refresh(creator.form?.destination === 'github')}
        >
          {creator.checking ? 'Checking…' : 'Check connection'}
        </button>
      </div>
    </section>
  );
}

function RepositoryState({ creator, onAnother }: { creator: Creator; onAnother: () => void }) {
  const { state, form } = creator;
  if (!form || state.kind === 'form') return null;
  if (state.kind === 'creating') {
    const applicable = stages
      .filter(
        ([key]) =>
          !['github', 'metadata', 'push', 'verify'].includes(key) || form.destination === 'github',
      )
      .filter(([key]) => key !== 'metadata' || !!form.topics.length || !!form.homepage);
    const current = applicable.findIndex(([key]) => key === state.stage);
    return (
      <main className="content">
        <div className="state-content" aria-live="polite" aria-busy="true">
          <h2>Creating repository</h2>
          <p className="state-project">{form.name}</p>
          <ol className="progress-list">
            {applicable.map(([key, label], index) => (
              <li
                key={key}
                className={
                  state.stage === 'complete' || index < current
                    ? 'done'
                    : key === state.stage
                      ? 'active'
                      : ''
                }
              >
                <span className={`step-symbol ${key === state.stage ? 'spinner' : ''}`}>
                  {(state.stage === 'complete' || index < current) && (
                    <Icon name="check" size={12} />
                  )}
                </span>
                {label}
              </li>
            ))}
          </ol>
          <p className="help">Keep this window open until creation finishes.</p>
        </div>
      </main>
    );
  }
  const success = state.kind === 'success';
  const result = success ? state.result : null;
  const error = state.kind === 'failure' ? state.error : null;
  const path = result?.path ?? error?.localPath ?? '';
  const url = result?.githubUrl ?? error?.githubUrl;
  return (
    <>
      <main className="content">
        <div className="state-content" aria-live="polite">
          <div className="state-heading">
            <Icon name={success ? 'check' : 'alert'} size={21} />
            <h2>
              {success
                ? 'Repository created'
                : error?.localReady
                  ? 'Publishing incomplete'
                  : 'Creation incomplete'}
            </h2>
          </div>
          <p className="state-project">{result?.name ?? form.name}</p>
          {error && (
            <div className="error-banner">
              <strong>{error.message}</strong>
              <p>{error.guidance}</p>
            </div>
          )}
          <dl className="result-details">
            <dt>Location</dt>
            <dd>
              <span className="copy-value">{displayPath(path)}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Copy project path"
                onClick={() => void creator.copy(displayPath(path))}
              >
                <Icon name="copy" size={14} />
              </button>
            </dd>
            {(result || error?.localReady) && (
              <>
                <dt>Branch</dt>
                <dd>
                  <code>{result?.branch ?? form.options.initialBranch}</code>
                </dd>
                <dt>Initial commit</dt>
                <dd>
                  <span>{result?.commitMessage ?? form.options.commitMessage}</span>
                  {result && <code className="commit-hash">{result.commit.slice(0, 7)}</code>}
                </dd>
              </>
            )}
            {url && (
              <>
                <dt>GitHub</dt>
                <dd>
                  <button
                    type="button"
                    className="result-link"
                    onClick={() => void creator.action('open_github')}
                  >
                    {url.replace('https://', '')}
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Copy GitHub URL"
                    onClick={() => void creator.copy(url)}
                  >
                    <Icon name="copy" size={14} />
                  </button>
                </dd>
              </>
            )}
            {result && (
              <>
                <dt>Generated files</dt>
                <dd className="generated-files">
                  {result.files.length
                    ? result.files.map((file) => <code key={file}>{file}</code>)
                    : 'None — empty initial commit'}
                </dd>
              </>
            )}
          </dl>
          {result?.warnings.map((warning) => (
            <p key={warning} className="notice" role="status">
              {warning}
            </p>
          ))}
          <div className="result-actions">
            {error?.canRetry && (
              <button className="primary" type="button" onClick={() => void creator.execute(true)}>
                Retry publishing <Icon name="arrow" size={14} />
              </button>
            )}
            <button type="button" onClick={() => void creator.action('open_project')}>
              <Icon name="folder" size={14} />
              Open Folder
            </button>
            {creator.environment?.vscodeAvailable && (
              <button type="button" onClick={() => void creator.action('open_vscode')}>
                <Icon name="code" size={14} />
                Open in VS Code
              </button>
            )}
            {url && (
              <button type="button" onClick={() => void creator.action('open_github')}>
                <Icon name="external" size={13} />
                {success ? 'Open on GitHub' : 'Inspect on GitHub'}
              </button>
            )}
          </div>
          {creator.notice && (
            <p className="notice" role="status">
              {creator.notice}
            </p>
          )}
        </div>
      </main>
      <footer className="action-bar">
        <span className="help">{success ? '' : 'Created files are preserved.'}</span>
        <button type="button" className={success ? 'primary' : ''} onClick={onAnother}>
          Create Another <Icon name="arrow" size={14} />
        </button>
      </footer>
    </>
  );
}
