import { useEffect, useState } from 'react';
import { AppearanceSettings } from './AppearanceSettings';
import { UpdateSettings } from './UpdateSettings';
import type { Updates } from './useUpdates';
import { Icon } from './icons';
import { ProjectBrief } from './ProjectBrief';
import type { Creator } from './useCreator';
import type { Configuration, Environment } from './types';
import type { Agent } from './aiTypes';
import type { Section } from './App';
import { displayPath, nameError } from './validation';
import { normalizeProjectName } from './projectName';
import {
  GitSettings,
  GithubSettings,
  type IdentityDraft,
  type IdentityMode,
} from './SetupSections';
import { detailOf } from './blockers';
import { SetupChecklist } from './setup/SetupChecklist';
import { TechnologySelector } from './TechnologySelector';
import { technologiesFor, technologySummary } from './technologies';
import { Button } from './ui';
import { GeneratedFileTree } from './GeneratedFileTree';
import './creation-fields.css';
export { TechnologySelector } from './TechnologySelector';

export function Overview({
  creator,
  simple,
  presetId,
  onApply,
  onManage,
  onSavePreset,
  onAgents,
  canUndo,
  onUndo,
}: {
  creator: Creator;
  simple: boolean;
  presetId: string;
  onApply: (c: Configuration, id: string) => void;
  onManage: () => void;
  onSavePreset: () => void;
  onAgents: () => void;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const { form, catalog, preferences } = creator;
  if (!form || !catalog || !preferences) return null;
  const presets = [...catalog.builtInPresets, ...preferences.customPresets];
  return (
    <div className="overview-layout creation-overview">
      <div className="overview-identity two-columns">
        <label className="field">
          <span className="control-label" id="project-name-label">
            Project name
          </span>
          <input
            id="project-name"
            aria-labelledby="project-name-label"
            aria-describedby="repository-name-help"
            autoFocus
            value={form.name}
            placeholder="my-project"
            maxLength={350}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!form.name && !!nameError(form.name)}
            onChange={(e) => creator.update('name', e.target.value)}
          />
          <span className="help" id="repository-name-help" aria-live="polite">
            Repository name: {normalizeProjectName(form.name) || 'Enter a project name'}
          </span>
          {form.name && nameError(form.name) && (
            <span className="inline-error">{nameError(form.name)}</span>
          )}
        </label>
        <label className="field">
          <span className="control-label">
            Description <span className="optional">optional</span>
          </span>
          <textarea
            className="short-description"
            rows={1}
            maxLength={350}
            value={form.description}
            placeholder="A short description of your idea"
            onChange={(e) => creator.update('description', e.target.value)}
          />
        </label>
      </div>
      <div className="field overview-preset">
        <label htmlFor="project-preset">Starting point</label>
        <div className="inline-actions">
          <select
            id="project-preset"
            value={presetId}
            onChange={(e) => {
              const p = presets.find((p) => p.id === e.target.value);
              if (p) onApply(p.configuration, p.id);
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
          <button type="button" onClick={onManage}>
            Manage…
          </button>
          <Button onClick={onSavePreset}>Save as preset</Button>
        </div>
      </div>
      <div className="overview-assistants two-columns creation-development">
        <Technology creator={creator} simple={simple} />
        <Assistant creator={creator} onAdvanced={onAgents} />
      </div>
      <div className="creation-location-group">
        <Location creator={creator} />
        <Destination creator={creator} />
      </div>
      <div className="overview-tools">
        <details className="brief-details">
          <summary>
            Project brief <span className="help">optional</span>
          </summary>
          <ProjectBrief value={form.brief} onChange={(brief) => creator.update('brief', brief)} />
        </details>
        {canUndo && (
          <button type="button" className="text-button" onClick={onUndo}>
            Undo preset change
          </button>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => onApply(catalog.defaultConfiguration, 'default')}
        >
          Reset configuration
        </button>
      </div>
    </div>
  );
}
function Technology({ creator, simple }: { creator: Creator; simple: boolean }) {
  const form = creator.form!;
  return (
    <TechnologySelector
      value={technologiesFor(form)}
      simple={simple}
      onChange={(technologies) => creator.update('options', { ...form.options, technologies })}
      ignorePresets={form.options.ignorePresets}
      onIgnorePresets={(ignorePresets) =>
        creator.update('options', { ...form.options, ignorePresets })
      }
    />
  );
}
function Assistant({ creator, onAdvanced }: { creator: Creator; onAdvanced: () => void }) {
  const form = creator.form!,
    ai = form.options.ai;
  return (
    <div className="field">
      <div className="field-label-row">
        <label htmlFor="quick-assistant">AI coding assistant</label>
        <button
          type="button"
          className="text-button"
          aria-label="Configure multiple assistants"
          onClick={onAdvanced}
        >
          More…
        </button>
      </div>
      <select
        id="quick-assistant"
        value={!ai.enabled ? '' : ai.agents.length === 1 ? ai.agents[0] : 'multiple'}
        onChange={(e) =>
          creator.update('options', {
            ...form.options,
            ai: {
              ...ai,
              enabled: !!e.target.value,
              agents: e.target.value ? [e.target.value as Agent] : ai.agents,
            },
          })
        }
      >
        <option value="">None</option>
        {creator.catalog!.studio.agents.map((a) => (
          <option value={a.id} key={a.id}>
            {a.name}
          </option>
        ))}
        {ai.agents.length > 1 && (
          <option value="multiple" disabled>
            Multiple assistants ({ai.agents.length})
          </option>
        )}
      </select>
      <span className="sr-only">
        {ai.enabled
          ? 'Recommended project instructions included. Installation is optional.'
          : 'You can add project instructions later.'}
      </span>
    </div>
  );
}
function Location({ creator }: { creator: Creator }) {
  const prefs = creator.preferences!;
  return (
    <div className="field overview-location">
      <label id="location-label">Save location</label>
      <div className="location-row">
        <div className="location-control">
          <span aria-labelledby="location-label" title={displayPath(prefs.parentPath)}>
            {displayPath(prefs.parentPath)}
          </span>
          <button
            type="button"
            onClick={() => void creator.chooseFolder()}
            disabled={creator.picking}
          >
            {creator.picking ? 'Choosing…' : 'Browse…'}
          </button>
        </div>
        {prefs.recentLocations.length > 0 && (
          <label className="recent-select">
            <span className="sr-only">Recent locations</span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value !== '') void creator.recentLocation(Number(e.target.value));
              }}
            >
              <option value="">Recent locations</option>
              {prefs.recentLocations.map((p, i) => (
                <option key={p} value={i}>
                  {displayPath(p)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <span className="sr-only">
        Creates a new project folder here. Existing folders are protected.
      </span>
    </div>
  );
}
function Destination({ creator }: { creator: Creator }) {
  const form = creator.form!,
    env = creator.environment;
  return (
    <div className="overview-destination" data-github={form.destination === 'github'}>
      <div className="field">
        <label id="destination-label">Destination</label>
        <div
          className="segmented destination-options"
          role="group"
          aria-labelledby="destination-label"
        >
          <button
            type="button"
            aria-pressed={form.destination === 'local'}
            onClick={() => void creator.destination('local')}
          >
            On this computer
          </button>
          <button
            type="button"
            aria-pressed={form.destination === 'github'}
            onClick={() => void creator.destination('github')}
          >
            GitHub
          </button>
        </div>
      </div>
      {form.destination === 'github' && (
        <>
          <div className="github-options two-columns">
            <div className="field github-visibility">
              <span className="control-label" id="visibility-label">
                Visibility
              </span>
              <div className="visibility" role="radiogroup" aria-label="Repository visibility">
                {(['private', 'public'] as const).map((v) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name="visibility"
                      checked={form.visibility === v}
                      onChange={() => creator.update('visibility', v)}
                    />
                    {v === 'private' ? 'Private' : 'Public'}
                  </label>
                ))}
              </div>
              <span className="help visibility-help">
                {form.visibility === 'private'
                  ? 'Only you and people you choose.'
                  : 'Anyone can view this project.'}
              </span>
            </div>
            <div className="field github-owner">
              <label htmlFor="github-owner">Owner</label>
              <select
                id="github-owner"
                value={form.githubOwner || env?.githubUser || ''}
                disabled={!env?.githubUser}
                onChange={(e) => creator.update('githubOwner', e.target.value)}
              >
                {!env?.githubUser && <option value="">Connect to GitHub first</option>}
                {env?.githubOwners.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <div className="connection-actions">
                <span className="help">
                  {env?.githubUser
                    ? `Signed in as ${env.githubUser}`
                    : env && detailOf(env).githubState === 'unverified'
                      ? 'Couldn’t reach GitHub to check your sign-in'
                      : env && !env.ghInstalled
                        ? 'GitHub CLI isn’t installed'
                        : 'Not connected'}
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void creator.refresh(true)}
                  disabled={creator.checking}
                >
                  Check connection
                </button>
              </div>
            </div>
          </div>
          {!env?.githubUser && (
            <div className="inline-actions">
              <span className="help">GitHub stores your project online.</span>
              <button type="button" onClick={() => void creator.connect()}>
                Connect to GitHub
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
export function ProjectSummary({ creator, presetName }: { creator: Creator; presetName: string }) {
  const form = creator.form!,
    path = displayPath(creator.preferences!.parentPath),
    slash = path.includes('\\') ? '\\' : '/';
  return (
    <dl className="project-summary">
      <dt>Project</dt>
      <dd>{normalizeProjectName(form.name) || 'Name needed'}</dd>
      <dt>Destination folder</dt>
      <dd className="mono">
        {path.replace(/[\\/]$/, '')}
        {slash}
        {normalizeProjectName(form.name) || 'my-project'}
      </dd>
      <dt>Publishing</dt>
      <dd>
        {form.destination === 'github'
          ? `${form.visibility === 'private' ? 'Private' : 'Public'} GitHub repository · ${form.githubOwner || creator.environment?.githubUser || 'Connect an account'}`
          : 'On this computer'}
      </dd>
      <dt>Starting point</dt>
      <dd>{presetName}</dd>
      <dt>Technologies</dt>
      <dd>{technologySummary(technologiesFor(form)) || 'Not selected'}</dd>
      <dt>AI instructions</dt>
      <dd>
        {form.options.ai.enabled
          ? form.options.ai.agents.join(', ') || 'Choose an assistant'
          : 'None'}
      </dd>
      <dt>Git</dt>
      <dd>
        <code>{form.options.initialBranch}</code> · {form.options.commitMessage}
      </dd>
    </dl>
  );
}
/** What the first commit will contain and who will be recorded as its author. */
function FirstCommit({ creator }: { creator: Creator }) {
  const form = creator.form!;
  const env = creator.environment;
  const projectName = form.options.commitAuthorName?.trim();
  const projectEmail = form.options.commitAuthorEmail?.trim();
  const saved = creator.preferences?.identityOverride;
  const detected = env ? detailOf(env).identity : null;
  const name = projectName || saved?.name || detected?.name || null;
  const email =
    form.destination === 'github'
      ? 'your GitHub private address'
      : projectEmail || saved?.email || detected?.email || null;
  return (
    <div className="context-first-commit">
      <h4>First commit</h4>
      <dl>
        <dt>Branch</dt>
        <dd>{form.options.initialBranch}</dd>
        <dt>Message</dt>
        <dd>{form.options.commitMessage}</dd>
        <dt>Author</dt>
        <dd>{name && email ? `${name} <${email}>` : 'Not set yet'}</dd>
      </dl>
    </div>
  );
}

export function Context({
  creator,
  section,
  presetName,
  fileSection,
  onPreview,
  onHandoff,
}: {
  creator: Creator;
  section: Section;
  presetName: string;
  presetDescription?: string;
  fileSection?: string;
  onPreview: (path: string) => void;
  onHandoff?: () => void;
}) {
  const form = creator.form!;
  const files = creator.files;
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<{ context: string; path: string }>();
  const context = section === 'files' ? `${section}:${fileSection}` : section;
  const suggested =
    section === 'agents'
      ? 'AGENTS.md'
      : section === 'files'
        ? ({
            ignore: '.gitignore',
            license: 'LICENSE',
            additional: '.editorconfig',
            readme: 'README.md',
          }[fileSection ?? 'readme'] ?? 'README.md')
        : 'README.md';
  const preferred = selection?.context === context ? selection.path : suggested;
  const preview = files.find((file) => file.path === preferred) ?? files[0];
  return (
    <div className="creation-context">
      <div className="context-heading">
        <Icon name="file" size={16} />
        <h3>Generated files</h3>
        <span className="context-count">{files.length}</span>
      </div>
      <p className="context-destination">
        <Icon name={form.destination === 'github' ? 'github' : 'folder'} size={14} />
        {form.destination === 'github'
          ? `${form.visibility === 'private' ? 'Private' : 'Public'} GitHub repository`
          : 'Local Git repository'}
      </p>
      {creator.previewing && (
        <p className="help" role="status">
          Updating preview…
        </p>
      )}
      {creator.previewError && (
        <p className="inline-error" role="alert">
          {creator.previewError}
        </p>
      )}
      {files.length > 0 && (
        <>
          <label className="field context-search">
            <span className="control-label">Find generated files</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
              placeholder="Filter file paths…"
            />
          </label>
          <div className="context-files" tabIndex={0} role="group" aria-label="Generated file tree">
            <GeneratedFileTree
              files={files}
              search={search}
              selected={preview?.path}
              onSelect={(path) => setSelection({ context, path })}
              collapsible
            />
          </div>
        </>
      )}
      {!files.length && !creator.previewing && (
        <p className="help">Empty repository · the first commit will contain no files.</p>
      )}
      {preview && (
        <div className="context-live-preview">
          <h4>
            {preview.path}
            <button
              type="button"
              className="text-button"
              aria-haspopup="dialog"
              onClick={() => onPreview(preview.path)}
            >
              Expand preview <Icon name="external" size={12} />
            </button>
          </h4>
          <pre className="context-code" tabIndex={0} aria-label={`${preview.path} preview`}>
            {preview.content}
          </pre>
        </div>
      )}
      {technologySummary(technologiesFor(form)) && (
        <div className="context-stack">
          <h4>Technology context</h4>
          <p>{technologySummary(technologiesFor(form))}</p>
        </div>
      )}
      <FirstCommit creator={creator} />
      {onHandoff && (
        <button type="button" className="text-button context-handoff" onClick={onHandoff}>
          Handoff prompt
        </button>
      )}
      <div className="context-footnote">
        <span>{presetName}</span>
        <span>{form.options.initialBranch}</span>
      </div>
    </div>
  );
}
export function SetupPanel({
  creator,
  onReturn,
  updates,
  updateRequest,
  initialTab,
}: {
  creator: Creator;
  onReturn: () => void;
  updates: Updates;
  updateRequest: number;
  initialTab?: 'git' | 'github';
}) {
  const env: Environment = creator.environment ?? {
    gitInstalled: false,
    identityReady: false,
    ghInstalled: false,
    githubUser: null,
    githubOwners: [],
    identityName: null,
    vscodeAvailable: false,
  };
  const form = creator.form!;
  const [tab, setTab] = useState<
    'git' | 'github' | 'tools' | 'appearance' | 'updates' | 'setup' | 'general'
  >(updateRequest ? 'updates' : (initialTab ?? 'git'));
  useEffect(() => {
    if (updateRequest) setTab('updates');
  }, [updateRequest]);
  // Drafts live here so they survive switching between the settings tabs.
  const [identityDraft, setIdentityDraft] = useState<IdentityDraft>({
    name: creator.preferences?.identityOverride?.name ?? '',
    email: creator.preferences?.identityOverride?.email ?? '',
  });
  const [identityMode, setIdentityMode] = useState<IdentityMode>('project');
  return (
    <div className="setup-settings">
      <div className="setup-summary">
        <div>
          <Icon name="settings" size={20} />
          <div>
            <strong>
              {tab === 'updates'
                ? 'Application updates'
                : tab === 'appearance'
                  ? 'Application appearance'
                  : 'Development environment'}
            </strong>
            {/* Readiness is stated once, in the page heading; this line only describes the tab. */}
            <span>
              {tab === 'updates'
                ? 'Choose when and how to update'
                : tab === 'appearance'
                  ? 'Theme and accent for this device'
                  : !creator.environment && !creator.checking
                    ? 'Computer checks are unavailable.'
                    : 'Checks for Git, GitHub and your editor'}
            </span>
          </div>
        </div>
        {tab !== 'appearance' && tab !== 'updates' && (
          <button
            type="button"
            onClick={() => void creator.refresh(tab === 'github' || form.destination === 'github')}
            disabled={creator.checking}
          >
            <Icon name="refresh" size={14} />
            {creator.checking ? 'Checking…' : 'Recheck'}
          </button>
        )}
      </div>
      <div className="setup-tabs" role="tablist" aria-label="Settings sections">
        {(
          [
            ['git', 'Git & identity'],
            ['github', 'GitHub'],
            ['tools', 'Development tools'],
            ['appearance', 'Appearance'],
            ['updates', 'Updates'],
            ['setup', 'Setup'],
            ['general', 'General'],
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            role="tab"
            id={`environment-tab-${id}`}
            aria-controls={`environment-panel-${id}`}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const tabs = [
                  'git',
                  'github',
                  'tools',
                  'appearance',
                  'updates',
                  'setup',
                  'general',
                ] as const;
                const index =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) %
                        tabs.length;
                setTab(tabs[index]);
                document.getElementById(`environment-tab-${tabs[index]}`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <section
        className="setup-settings-panel"
        role="tabpanel"
        id={`environment-panel-${tab}`}
        aria-labelledby={`environment-tab-${tab}`}
      >
        {tab === 'appearance' && <AppearanceSettings creator={creator} />}
        {tab === 'updates' && <UpdateSettings updates={updates} />}
        {tab !== 'appearance' && tab !== 'updates' && !creator.environment && (
          <p role="status">
            {creator.checking
              ? 'Checking your computer…'
              : 'Computer checks are unavailable. Select Recheck to try again.'}
          </p>
        )}
        {tab === 'setup' && <SetupChecklist creator={creator} variant="settings" />}
        {tab === 'general' && (
          <div className="setup-identity">
            <div className="setup-section-heading">
              <h3>Project options</h3>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={creator.preferences?.experienceMode === 'advanced'}
                onChange={(event) =>
                  void creator.experienceMode(event.target.checked ? 'advanced' : 'simple')
                }
              />
              Show advanced options by default
            </label>
            <p className="help">
              Every option is always available. This only decides how much detail pickers such as
              the technology selector show at first.
            </p>
          </div>
        )}
        {tab === 'git' && !!creator.environment && (
          <GitSettings
            creator={creator}
            env={env}
            draft={identityDraft}
            onDraft={setIdentityDraft}
            mode={identityMode}
            onMode={setIdentityMode}
          />
        )}
        {tab === 'github' && !!creator.environment && (
          <GithubSettings creator={creator} env={env} />
        )}
        {tab === 'tools' && !!creator.environment && (
          <>
            <div className="setup-section-heading">
              <h3>Editors & coding assistants</h3>
              <span className="help">Optional</span>
            </div>
            <p className="help setup-tools-note">
              Generate AI instructions with or without installing an assistant.
            </p>
            <div className="setup-tools-list">
              <div className="setup-status-row">
                <div className="setup-tool-name">
                  <Icon name="code" size={16} />
                  <strong>VS Code</strong>
                </div>
                <span className="setup-status" data-ready={env.vscodeAvailable}>
                  {env.vscodeAvailable ? 'Available' : 'Not detected'}
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void creator.action('open_setup_resource', { resource: 'vscode' })}
                >
                  Official guide
                  <Icon name="external" size={12} />
                </button>
              </div>
              {env.optionalTools?.map((tool) => (
                <div className="setup-status-row" key={tool.id}>
                  <div className="setup-tool-name">
                    <Icon name="code" size={16} />
                    <strong>{tool.name}</strong>
                  </div>
                  <span className="setup-status" data-ready={tool.status === 'available'}>
                    {tool.status === 'available'
                      ? 'Available'
                      : tool.status === 'not-checked'
                        ? 'Not checked'
                        : 'Not detected'}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      void creator.action('open_setup_resource', { resource: tool.id })
                    }
                  >
                    Official guide
                    <Icon name="external" size={12} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      <div className="setup-settings-footer">
        <span>
          {tab === 'appearance'
            ? 'Saved on this computer'
            : 'Local settings · no tools are installed automatically'}
        </span>
        <button type="button" onClick={onReturn}>
          Return to project setup
          <Icon name="arrow" size={14} />
        </button>
      </div>
    </div>
  );
}
