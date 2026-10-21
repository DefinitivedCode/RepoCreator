import { Icon } from './icons';
import { ProjectBrief } from './ProjectBrief';
import type { Creator } from './useCreator';
import type { Configuration } from './types';
import type { Agent } from './aiTypes';
import type { Section } from './App';
import { displayPath, nameError } from './validation';
import { emptyBrief } from './handoff';

export function Overview({
  creator,
  simple,
  presetId,
  onApply,
  onManage,
  onAgents,
}: {
  creator: Creator;
  simple: boolean;
  presetId: string;
  onApply: (c: Configuration, id: string) => void;
  onManage: () => void;
  onAgents: () => void;
}) {
  const { form, catalog, preferences } = creator;
  if (!form || !catalog || !preferences) return null;
  const presets = [...catalog.builtInPresets, ...preferences.customPresets];
  const preset = presets.find((p) => p.id === presetId);
  return (
    <>
      <p className="section-intro">
        {simple
          ? 'Give your idea a home. Choose a starting point, then review the files before creating your project.'
          : 'Configure the project identity and starting point. Use the navigation to refine files and AI instructions.'}
      </p>
      <div className="overview-grid">
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
            rows={2}
            maxLength={350}
            value={form.description}
            placeholder="A short description of your idea"
            onChange={(e) => creator.update('description', e.target.value)}
          />
        </label>
      </div>
      <section className="settings-section">
        <div className="field">
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
        {preset && (
          <p className="help">
            <strong>What’s included? </strong>
            {preset.description ||
              `${preset.configuration.readme === 'none' ? 'No README' : 'README'}, ${preset.configuration.options.ignorePresets.length} exclude-file presets, ${preset.configuration.options.ai.enabled ? preset.configuration.options.ai.agents.join(', ') + ' instructions' : 'AI instructions off'}.`}
          </p>
        )}
        <div className="two-columns">
          <Technology creator={creator} />
          <Assistant creator={creator} simple={simple} onAdvanced={onAgents} />
        </div>
      </section>
      <section className="settings-section">
        <Location creator={creator} />
        <Destination creator={creator} simple={simple} />
      </section>
      <details className="brief-details">
        <summary>
          Project brief <span className="help">optional · helps your AI handoff</span>
        </summary>
        <ProjectBrief
          value={form.brief}
          onChange={(brief) => creator.update('brief', brief)}
          simple={simple}
        />
      </details>
      {!simple && (
        <button
          type="button"
          className="text-button"
          onClick={() => onApply(catalog.defaultConfiguration, 'default')}
        >
          Reset configuration
        </button>
      )}
    </>
  );
}
function Technology({ creator }: { creator: Creator }) {
  const form = creator.form!;
  const value = form.brief?.technologies ?? '';
  return (
    <label className="field">
      <span className="control-label">Language or technology</span>
      <select
        value={
          ['', 'JavaScript / TypeScript', 'Python', 'Rust', 'C#', 'Other'].includes(value)
            ? value
            : 'Other'
        }
        onChange={(e) =>
          creator.update('brief', { ...emptyBrief, ...form.brief, technologies: e.target.value })
        }
      >
        <option value="">Not sure yet</option>
        {['JavaScript / TypeScript', 'Python', 'Rust', 'C#', 'Other'].map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      <span className="help">A planning preference; no framework is installed.</span>
    </label>
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
      <label htmlFor="quick-assistant">AI coding assistant</label>
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
      <span className="help">
        {ai.enabled
          ? 'Recommended project instructions included. Installation is optional.'
          : 'You can add project instructions later.'}
      </span>
      {!simple && (
        <button type="button" className="text-button" onClick={onAdvanced}>
          Configure multiple assistants
        </button>
      )}
    </div>
  );
}
function Location({ creator }: { creator: Creator }) {
  const prefs = creator.preferences!;
  return (
    <div className="field">
      <label id="location-label">Save location</label>
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
      <p className="help">
        A new <code>{creator.form?.name || 'my-project'}</code> folder will be created here.
        Existing folders are protected.
      </p>
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
  );
}
function Destination({ creator, simple }: { creator: Creator; simple: boolean }) {
  const form = creator.form!,
    env = creator.environment;
  return (
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
      {form.destination === 'github' && (
        <>
          <p className="help">
            GitHub stores and shares your project online. You need a connected account.
          </p>
          <div className="visibility" role="radiogroup" aria-label="Repository visibility">
            {(['private', 'public'] as const).map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name="visibility"
                  checked={form.visibility === v}
                  onChange={() => creator.update('visibility', v)}
                />
                {v === 'private'
                  ? 'Private — only people you choose'
                  : 'Public — anyone can see the project'}
              </label>
            ))}
          </div>
          <label className="field">
            <span className="control-label">Owner</span>
            <select
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
          </label>
          <div className="inline-actions">
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
            {!env?.githubUser && (
              <button type="button" onClick={() => void creator.connect()}>
                Connect to GitHub
              </button>
            )}
          </div>
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
}: {
  creator: Creator;
  section: Section;
  presetName: string;
}) {
  const files = creator.files,
    preview = files.find((f) =>
      section === 'agents'
        ? f.path === 'AGENTS.md'
        : section === 'files'
          ? f.path === 'README.md'
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
          <div className="context-facts">
            <span>
              {creator.form!.destination === 'github'
                ? `${creator.form!.visibility} on GitHub`
                : 'Saved on this computer'}
            </span>
            <span>
              {creator.form!.options.ai.enabled
                ? creator.form!.options.ai.agents.join(', ')
                : 'No AI instructions'}
            </span>
          </div>
          <h4>{creator.previewing ? 'Updating files…' : `${files.length} planned files`}</h4>
          <ul className="context-files">
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
  if (!env) return <p role="status">Checking your computer…</p>;
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
