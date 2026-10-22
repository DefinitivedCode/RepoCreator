import { Icon } from './icons';
import { ProjectBrief } from './ProjectBrief';
import type { Creator } from './useCreator';
import type { Configuration } from './types';
import type { Agent } from './aiTypes';
import type { Section } from './App';
import { displayPath, nameError } from './validation';
import { TechnologySelector } from './TechnologySelector';
import { technologiesFor, technologySummary } from './technologies';
export { TechnologySelector } from './TechnologySelector';

export function Overview({
  creator,
  simple,
  presetId,
  onApply,
  onManage,
  onAgents,
  canUndo,
  onUndo,
}: {
  creator: Creator;
  simple: boolean;
  presetId: string;
  onApply: (c: Configuration, id: string) => void;
  onManage: () => void;
  onAgents: () => void;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const { form, catalog, preferences } = creator;
  if (!form || !catalog || !preferences) return null;
  const presets = [...catalog.builtInPresets, ...preferences.customPresets];
  return (
    <div className="overview-layout">
      <div className="overview-identity two-columns">
        <label className="field">
          <span className="control-label">Project name</span>
          <input
            autoFocus
            value={form.name}
            placeholder="my-project"
            maxLength={101}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!form.name && !!nameError(form.name)}
            onChange={(e) => creator.update('name', e.target.value)}
          />
          {form.name && nameError(form.name) && (
            <span className="inline-error">{nameError(form.name)}</span>
          )}
        </label>
        <label className="field">
          <span className="control-label">
            {simple ? 'What are you making?' : 'Description'}{' '}
            <span className="optional">optional</span>
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
        <label htmlFor="project-preset">{simple ? 'Starting point' : 'Project preset'}</label>
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
        </div>
      </div>
      <div className="overview-assistants two-columns">
        <Technology creator={creator} simple={simple} />
        <Assistant creator={creator} simple={simple} onAdvanced={onAgents} />
      </div>
      <Location creator={creator} />
      <Destination creator={creator} simple={simple} />
      <div className="overview-tools">
        <details className="brief-details">
          <summary>
            Project brief <span className="help">optional</span>
          </summary>
          <ProjectBrief
            value={form.brief}
            onChange={(brief) => creator.update('brief', brief)}
            simple={simple}
          />
        </details>
        {canUndo && (
          <button type="button" className="text-button" onClick={onUndo}>
            Undo preset change
          </button>
        )}
        {!simple && (
          <button
            type="button"
            className="text-button"
            onClick={() => onApply(catalog.defaultConfiguration, 'default')}
          >
            Reset configuration
          </button>
        )}
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
function Assistant({
  creator,
  simple,
  onAdvanced,
}: {
  creator: Creator;
  simple: boolean;
  onAdvanced: () => void;
}) {
  const form = creator.form!,
    ai = form.options.ai;
  return (
    <div className="field">
      <div className="field-label-row">
        <label htmlFor="quick-assistant">AI coding assistant</label>
        {!simple && (
          <button
            type="button"
            className="text-button"
            aria-label="Configure multiple assistants"
            onClick={onAdvanced}
          >
            More…
          </button>
        )}
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
function Destination({ creator, simple }: { creator: Creator; simple: boolean }) {
  const form = creator.form!,
    env = creator.environment;
  return (
    <div className="overview-destination" data-github={form.destination === 'github'}>
      <div className="field">
        <label id="destination-label">
          {simple ? 'Where should the project live?' : 'Destination'}
        </label>
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
            {simple ? 'On this computer' : 'Local only'}
          </button>
          <button
            type="button"
            aria-pressed={form.destination === 'github'}
            onClick={() => void creator.destination('github')}
          >
            {simple ? 'Computer and GitHub' : 'GitHub'}
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
                  {env?.githubUser ? `Signed in as ${env.githubUser}` : 'Not connected'}
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
      <dd>{form.name || 'Name needed'}</dd>
      <dt>Destination folder</dt>
      <dd className="mono">
        {path.replace(/[\\/]$/, '')}
        {slash}
        {form.name || 'my-project'}
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
export function Context({
  creator,
  section,
  presetName,
  presetDescription,
  fileSection,
}: {
  creator: Creator;
  section: Section;
  presetName: string;
  presetDescription?: string;
  fileSection?: string;
}) {
  const files = creator.files,
    preview = files.find((f) =>
      section === 'agents'
        ? f.path === 'AGENTS.md'
        : section === 'files'
          ? f.path ===
            ({
              ignore: '.gitignore',
              license: 'LICENSE',
              additional: '.editorconfig',
              readme: 'README.md',
            }[fileSection ?? 'readme'] ?? 'README.md')
          : false,
    );
  return (
    <>
      <p className="eyebrow">
        {section === 'agents'
          ? 'AI INSTRUCTIONS'
          : section === 'files'
            ? 'GENERATED FILES'
            : section === 'handoff'
              ? 'LOCAL & PRIVATE'
              : 'PROJECT DETAILS'}
      </p>
      <h3>
        {section === 'handoff'
          ? 'Ready for your next conversation'
          : creator.form!.name || 'Your next project'}
      </h3>
      {section === 'handoff' ? (
        <p className="help">
          Your prompt is assembled on this computer. Nothing is sent to an AI service. Review it
          before sharing.
        </p>
      ) : (
        <>
          <p className="help">{presetName}</p>
          {section === 'overview' && (
            <p className="context-description help">
              {presetDescription ||
                'Choose a starting point, then adjust any setting. Existing folders are never overwritten.'}
            </p>
          )}
          <div className="context-facts">
            <span>
              {creator.form!.destination === 'github'
                ? `${creator.form!.visibility === 'private' ? 'Private' : 'Public'} on GitHub`
                : 'On this computer'}
            </span>
            <span>
              {creator.form!.options.ai.enabled
                ? creator
                    .catalog!.studio.agents.filter((agent) =>
                      creator.form!.options.ai.agents.includes(agent.id),
                    )
                    .map((agent) => agent.name)
                    .join(', ')
                : 'No AI instructions'}
            </span>
          </div>
          {section === 'overview' && (
            <p className="help context-description">
              No tools are installed. AI assistants are optional; choosing one adds project
              instructions.
            </p>
          )}
          <h4>{creator.previewing ? 'Updating files…' : `${files.length} planned files`}</h4>
          <ul className="context-files" tabIndex={0} aria-label="Planned generated files">
            {files.map((f) => (
              <li key={f.path}>
                <Icon name="file" size={12} />
                <code>{f.path}</code>
              </li>
            ))}
          </ul>
          {!files.length && !creator.previewing && (
            <p className="help">An empty initial commit will be created.</p>
          )}
          {preview && (
            <>
              <h4>{preview.path}</h4>
              <pre className="context-code" tabIndex={0}>
                {preview.content}
              </pre>
            </>
          )}
          {creator.previewError && <p className="inline-error">{creator.previewError}</p>}
        </>
      )}
      <p className="context-bottom help">
        {section === 'setup'
          ? 'Optional coding assistants never block project creation.'
          : 'Review the complete file contents in Review.'}
      </p>
    </>
  );
}
export function SetupPanel({ creator, onReturn }: { creator: Creator; onReturn: () => void }) {
  const env = creator.environment,
    form = creator.form!;
  if (!env)
    return (
      <div className="setup-checklist">
        <p role="status">
          {creator.checking ? 'Checking your computer…' : 'Computer checks are unavailable.'}
        </p>
        {!creator.checking && (
          <div className="inline-actions">
            <button
              type="button"
              onClick={() => void creator.refresh(form.destination === 'github')}
            >
              Recheck
            </button>
            <button type="button" onClick={onReturn}>
              Return to project
            </button>
          </div>
        )}
      </div>
    );
  const github = form.destination === 'github',
    option = (key: 'commitAuthorName' | 'commitAuthorEmail', value: string) =>
      creator.update('options', { ...form.options, [key]: value });
  return (
    <div className="setup-checklist">
      <p className="section-intro">
        Only Git is needed for a local project. GitHub and coding assistants are optional.
      </p>
      <section className="settings-section">
        <h3>Git · {env.gitInstalled ? 'Installed' : 'Required'}</h3>
        <p>Git keeps a history of your project’s changes.</p>
        {!env.gitInstalled && (
          <button
            type="button"
            onClick={() => void creator.action('open_setup_resource', { resource: 'git' })}
          >
            Open Git installation instructions
          </button>
        )}
        <p className="help">
          Commit identity:{' '}
          {env.identityReady
            ? 'Ready'
            : 'Enter a name and email below, or configure Git with its official guide.'}
        </p>
        {!env.identityReady && (
          <>
            <div className="two-columns">
              <label className="field">
                <span className="control-label">Your name for this project</span>
                <input
                  value={form.options.commitAuthorName ?? ''}
                  onChange={(e) => option('commitAuthorName', e.target.value)}
                />
              </label>
              <label className="field">
                <span className="control-label">Email for this project</span>
                <input
                  type="email"
                  value={form.options.commitAuthorEmail ?? ''}
                  onChange={(e) => option('commitAuthorEmail', e.target.value)}
                />
              </label>
            </div>
            <p className="help">
              This identity is set only in the new project. Use an email you are comfortable
              recording in Git history.
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                void creator.action('open_setup_resource', { resource: 'git-identity' })
              }
            >
              Git identity help
            </button>
          </>
        )}
      </section>
      <section className="settings-section">
        <h3>GitHub · {github ? 'Selected' : 'Optional'}</h3>
        <p>GitHub lets you store and share your project online.</p>
        <p className="help">
          {!env.ghInstalled
            ? 'GitHub CLI is unavailable.'
            : env.githubUser
              ? `Connected as ${env.githubUser}`
              : github
                ? 'GitHub CLI is installed; connect your account.'
                : 'Connection has not been checked for this local project.'}
        </p>
        <div className="inline-actions">
          {!env.ghInstalled ? (
            <button
              type="button"
              onClick={() => void creator.action('open_setup_resource', { resource: 'gh' })}
            >
              Install GitHub CLI
            </button>
          ) : (
            <button type="button" onClick={() => void creator.connect()}>
              Connect to GitHub
            </button>
          )}
          <button type="button" onClick={() => void creator.refresh(true)}>
            Check GitHub connection
          </button>
        </div>
      </section>
      <section className="settings-section">
        <h3>Coding assistants & editor · Optional</h3>
        <p className="help">
          Claude Code and other assistants can help develop your project. You can generate
          instructions and handoff prompts without installing them.
        </p>
        {env.optionalTools?.map((tool) => (
          <div className="tool-status" key={tool.id}>
            <span>{tool.name}</span>
            <span className="help">
              {tool.status === 'available'
                ? 'Available'
                : tool.status === 'not-checked'
                  ? 'Not checked'
                  : 'Unavailable'}
            </span>
            {tool.status !== 'available' && (
              <button
                className="text-button"
                type="button"
                onClick={() => void creator.action('open_setup_resource', { resource: tool.id })}
              >
                Official guide
              </button>
            )}
          </div>
        )) ?? <p className="help">VS Code: {env.vscodeAvailable ? 'Available' : 'Unavailable'}</p>}
      </section>
      <div className="inline-actions">
        <button
          type="button"
          disabled={creator.checking}
          onClick={() => void creator.refresh(github)}
        >
          {creator.checking ? 'Checking…' : 'Recheck'}
        </button>
        <button type="button" className="primary" onClick={onReturn}>
          Return to project setup
        </button>
      </div>
    </div>
  );
}
