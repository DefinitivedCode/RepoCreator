import { useEffect, useRef, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from './icons';
import { appError, displayPath } from './validation';
import { PromptWorkspace } from './HandoffPanel';
import { TechnologySelector } from './WorkspaceFields';
import { technologySummary, normalizeTechnologies } from './technologies';
import type { ProjectPreset } from './types';
import {
  commandDirectory,
  commandText,
  type CommandCategory,
  type CommandRun,
  type ProjectCommand,
  type ProjectLauncher,
  type ProjectTool,
  type ProjectWorkspaceState,
  type RecentProject,
} from './workspaceTypes';
import './project-workspace.css';

const categories: CommandCategory[] = [
  'setup',
  'development',
  'build',
  'test',
  'lint',
  'deploy',
  'custom',
];
const emptyLauncher: ProjectLauncher = { terminal: 'auto', executables: {} };
function gitLabel(status: string): string {
  return (
    (
      {
        clean: 'Working tree clean',
        changes: 'Uncommitted changes',
        missing: 'Folder missing',
        unavailable: 'Git status unavailable',
      } as Record<string, string>
    )[status] ??
    (status || 'Git status unavailable')
  );
}
function presentedCommand(command: ProjectCommand): string {
  return commandText({
    ...command,
    executable: displayPath(command.executable),
    args: command.args.map(displayPath),
  });
}
function message(error: unknown): string {
  const detail = appError(error);
  return [detail.message, detail.guidance].filter(Boolean).join(' ');
}
function date(value: number): string {
  return value
    ? new Date(value < 1e12 ? value * 1000 : value).toLocaleDateString()
    : 'Not opened yet';
}
function normalize(project: RecentProject): RecentProject {
  return {
    ...project,
    commands: project.commands ?? [],
    technologies: normalizeTechnologies(project.technologies, project.context.brief?.technologies),
    launcher: project.launcher ?? emptyLauncher,
  };
}

export function Projects({
  initialProjectId,
  onSelect,
  copy,
  commandPresets,
  onSaveCommandPreset,
}: {
  initialProjectId?: string;
  onSelect: (id?: string) => void;
  copy: (text: string) => Promise<void>;
  commandPresets: ProjectPreset[];
  onSaveCommandPreset: (commands: ProjectCommand[]) => void;
}) {
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('opened');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  async function load() {
    try {
      const result = await invoke<RecentProject[]>('list_recent_projects');
      setProjects(Array.isArray(result) ? result.map(normalize) : []);
      setError('');
    } catch (error) {
      setError(message(error));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [initialProjectId]);
  async function add() {
    setPending(true);
    try {
      const result = await invoke<RecentProject | null>('add_existing_project');
      if (result) {
        await load();
        onSelect(result.id);
      }
    } catch (error) {
      setError(message(error));
    } finally {
      setPending(false);
    }
  }
  async function pin(project: RecentProject) {
    try {
      const result = await invoke<RecentProject>('save_project_settings', {
        id: project.id,
        pinned: !project.pinned,
        technologies: project.technologies,
        launcher: project.launcher,
      });
      setProjects((items) =>
        items.map((item) => (item.id === result.id ? normalize(result) : item)),
      );
    } catch (error) {
      setError(message(error));
    }
  }
  async function remove(project: RecentProject) {
    try {
      const result = await invoke<RecentProject[]>('remove_recent_project', { id: project.id });
      setProjects(result.map(normalize));
    } catch (error) {
      setError(message(error));
    }
  }
  if (initialProjectId)
    return (
      <ProjectWorkspace
        key={initialProjectId}
        id={initialProjectId}
        onBack={() => onSelect()}
        copy={copy}
        commandPresets={commandPresets}
        onSaveCommandPreset={onSaveCommandPreset}
      />
    );
  const visible = projects
    .filter((project) =>
      `${project.context.projectName} ${project.context.localPath} ${technologySummary(project.technologies)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (sort === 'name'
          ? a.context.projectName.localeCompare(b.context.projectName)
          : sort === 'created'
            ? b.createdAt - a.createdAt
            : (b.lastOpenedAt || b.createdAt) - (a.lastOpenedAt || a.createdAt)),
    );
  return (
    <main className="library-page rc-workspace-library" aria-label="Project library">
      <div className="page-heading">
        <div>
          <h2>Projects</h2>
          <p className="help">Your repositories, tools and saved commands.</p>
        </div>
        <button type="button" className="primary" onClick={() => void add()} disabled={pending}>
          {pending ? 'Choosing folder…' : 'Add existing project'} <Icon name="folder" size={15} />
        </button>
      </div>
      <div className="library-toolbar">
        <label className="library-search">
          <span className="sr-only">Search projects</span>
          <input
            type="search"
            placeholder="Search projects, paths or technologies"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="sort-control">
          <span>Sort</span>
          <select
            aria-label="Sort projects"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="opened">Last opened</option>
            <option value="created">Recently created</option>
            <option value="name">Name</option>
          </select>
        </label>
        <span className="help">
          {visible.length} {visible.length === 1 ? 'project' : 'projects'}
        </span>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading projects…</p>
      ) : !visible.length ? (
        <div className="empty-workspace">
          <Icon name="folder" size={32} />
          <h3>{query ? 'No matching projects' : 'Make room for your next project'}</h3>
          <p className="help">
            {query
              ? 'Try another name, path or technology.'
              : 'Create a project or add a local Git repository to keep its tools and commands here.'}
          </p>
        </div>
      ) : (
        <div className="project-library">
          {visible.map((project) => (
            <article className="project-card" key={project.id}>
              <div className="project-card-heading">
                <div className="project-glyph">
                  <Icon name="repo" size={20} />
                </div>
                <div>
                  <button
                    type="button"
                    className="project-name"
                    onClick={() => onSelect(project.id)}
                  >
                    {project.context.projectName}
                    <Icon name="arrow" size={15} />
                  </button>
                  <p className="path">{displayPath(project.context.localPath)}</p>
                </div>
                <button
                  type="button"
                  className={`pin-button ${project.pinned ? 'pinned' : ''}`}
                  aria-label={`${project.pinned ? 'Unpin' : 'Pin'} ${project.context.projectName}`}
                  aria-pressed={project.pinned}
                  onClick={() => void pin(project)}
                >
                  {project.pinned ? '★' : '☆'}
                </button>
              </div>
              <p className="help project-tech">
                {technologySummary(project.technologies) || 'No technologies selected'}
              </p>
              <div className="project-card-footer">
                <span className="help">Last opened {date(project.lastOpenedAt)}</span>
                <div className="inline-actions">
                  <button type="button" onClick={() => onSelect(project.id)}>
                    Open workspace
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void remove(project)}
                  >
                    Remove from history
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="library-note help">
        Project preferences stay on this computer. Removing history keeps the source folder.
      </p>
    </main>
  );
}

function ProjectWorkspace({
  id,
  onBack,
  copy,
  commandPresets,
  onSaveCommandPreset,
}: {
  id: string;
  onBack: () => void;
  copy: (text: string) => Promise<void>;
  commandPresets: ProjectPreset[];
  onSaveCommandPreset: (commands: ProjectCommand[]) => void;
}) {
  const [workspace, setWorkspace] = useState<ProjectWorkspaceState | null>(null);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [handoff, setHandoff] = useState(false);
  async function refresh() {
    try {
      const result = await invoke<ProjectWorkspaceState>('get_project_workspace', { id });
      setWorkspace({ ...result, project: normalize(result.project) });
      setError('');
    } catch (error) {
      setError(message(error));
    }
  }
  useEffect(() => {
    void refresh();
  }, [id]);
  async function relocate() {
    try {
      if (await invoke('relocate_project', { id })) await refresh();
    } catch (error) {
      setError(message(error));
    }
  }
  const project = workspace?.project;
  return (
    <main className="project-workspace-page rc-project-workspace" aria-label="Project workspace">
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {!workspace || !project ? (
        <p role="status">Loading workspace…</p>
      ) : (
        <>
          <div className="project-workspace-heading">
            <button
              type="button"
              className="text-button library-back"
              onClick={onBack}
              aria-label="All projects"
            >
              <Icon name="chevron" size={17} />
            </button>
            <div className="project-glyph">
              <Icon name="repo" size={20} />
            </div>
            <div>
              <h2>{project.context.projectName}</h2>
              <p className="path" title={displayPath(project.context.localPath)}>
                {displayPath(project.context.localPath)}
              </p>
            </div>
            <span className={`project-git-state git-${workspace.gitStatus}`}>
              {gitLabel(workspace.gitStatus)}
            </span>
            <span className="project-branch">
              <Icon name="repo" size={13} />
              {workspace.branch || 'No branch'}
            </span>
          </div>
          <div className="workspace-tabs" role="group" aria-label="Project workspace sections">
            {[
              ['overview', 'Overview'],
              ['open', 'Open'],
              ['commands', 'Commands'],
              ['settings', 'Project Settings'],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={tab === value}
                onClick={() => {
                  setTab(value);
                  setHandoff(false);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {!workspace.exists && (
            <div className="missing-project" role="alert">
              <Icon name="alert" size={20} />
              <div>
                <strong>Project folder is missing</strong>
                <p>The folder may have moved. Locate it to enable tools and commands.</p>
              </div>
              <button type="button" onClick={() => void relocate()}>
                Locate folder
              </button>
            </div>
          )}
          <div className="project-view">
            {tab === 'overview' && (
              <>
                <div className="workspace-overview-grid">
                  <section className="workspace-card">
                    <h3>About this project</h3>
                    <dl className="workspace-facts">
                      <dt>Git status</dt>
                      <dd>{gitLabel(workspace.gitStatus)}</dd>
                      <dt>Technologies</dt>
                      <dd>{technologySummary(project.technologies) || 'Not selected'}</dd>
                      <dt>Created</dt>
                      <dd>{date(project.createdAt)}</dd>
                      <dt>Last opened</dt>
                      <dd>{date(project.lastOpenedAt)}</dd>
                      {project.context.repositoryUrl && (
                        <>
                          <dt>Repository</dt>
                          <dd>
                            <button
                              className="result-link"
                              type="button"
                              onClick={() =>
                                void invoke('open_recent_project', { id, target: 'github' }).catch(
                                  (value) => setError(message(value)),
                                )
                              }
                            >
                              {project.context.repositoryUrl.replace('https://', '')}
                              <Icon name="external" size={12} />
                            </button>
                          </dd>
                        </>
                      )}
                    </dl>
                    {project.context.description && (
                      <p className="help">{project.context.description}</p>
                    )}
                  </section>
                  <section className="workspace-card">
                    <h3>Continue working</h3>
                    <div className="workspace-quick-actions">
                      <button
                        type="button"
                        disabled={!workspace.exists}
                        onClick={() => setTab('open')}
                      >
                        <Icon name="external" size={16} />
                        Open with a tool
                        <Icon name="arrow" size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={!workspace.exists}
                        onClick={() => setTab('commands')}
                      >
                        <Icon name="code" size={16} />
                        {project.commands.length
                          ? `${project.commands.length} saved commands`
                          : 'Configure commands'}
                        <Icon name="arrow" size={14} />
                      </button>
                      <button type="button" onClick={() => setHandoff(!handoff)}>
                        <Icon name="file" size={16} />
                        Plan with AI
                        <Icon name="arrow" size={14} />
                      </button>
                    </div>
                  </section>
                </div>
                {handoff && (
                  <PromptWorkspace
                    context={project.context}
                    recommendedTemplate={project.handoffTemplate}
                    copy={copy}
                  />
                )}
              </>
            )}
            {tab === 'open' && (
              <>
                <div className="view-heading">
                  <div>
                    <h3>Open this project</h3>
                    <p className="help">
                      Editors open the folder. Coding assistants start in your terminal.
                    </p>
                  </div>
                </div>
                <ToolLauncher
                  id={id}
                  disabled={!workspace.exists}
                  onConfigure={() => setTab('settings')}
                />
              </>
            )}
            {tab === 'commands' && (
              <Commands
                project={project}
                exists={workspace.exists}
                copy={copy}
                onChange={(next) => setWorkspace({ ...workspace, project: normalize(next) })}
                presets={commandPresets}
                onSavePreset={onSaveCommandPreset}
              />
            )}
            {tab === 'settings' && (
              <ProjectSettings
                project={project}
                platform={workspace.platform}
                onChange={(next) => setWorkspace({ ...workspace, project: normalize(next) })}
                onRelocate={() => void relocate()}
              />
            )}
          </div>
        </>
      )}
    </main>
  );
}

function toolState(tool: ProjectTool): string {
  return tool.status ?? (tool.available ? 'available' : 'unknown');
}
function toolStatus(tool: ProjectTool): string {
  return (
    (
      {
        available: 'Available',
        missing: 'Not installed',
        invalid: 'Configured path invalid',
        unknown: 'Not confirmed',
      } as Record<string, string>
    )[toolState(tool)] ?? 'Not confirmed'
  );
}
function useProjectTools(id: string) {
  const [tools, setTools] = useState<ProjectTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);
  async function detect(refresh = false) {
    const revision = ++request.current;
    setLoading(true);
    try {
      const result = await invoke<ProjectTool[]>(
        'get_project_tools',
        refresh ? { id, refresh: true } : { id },
      );
      if (revision === request.current) {
        setTools(Array.isArray(result) ? result : []);
        setError('');
      }
    } catch (value) {
      if (revision === request.current) setError(message(value));
    } finally {
      if (revision === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    void detect();
    return () => {
      request.current++;
    };
  }, [id]);
  return { tools, loading, error, refresh: () => void detect(true) };
}

export function ToolLauncher({
  id,
  disabled = false,
  compact = false,
  onConfigure,
}: {
  id: string;
  disabled?: boolean;
  compact?: boolean;
  onConfigure?: () => void;
}) {
  const detection = useProjectTools(id);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const visible = detection.tools.filter(
    (tool) => !compact || !['folder', 'vscode'].includes(tool.id),
  );
  const available = visible.filter((tool) => toolState(tool) === 'available' && tool.available);
  const other = visible.filter((tool) => !available.includes(tool));
  async function launch(tool: string) {
    setPending(tool);
    try {
      await invoke('launch_project_tool', { id, tool });
      setError('');
    } catch (value) {
      setError(message(value));
    } finally {
      setPending('');
    }
  }
  function documentation(tool: ProjectTool) {
    return tool.documentation ? (
      <a
        href={tool.documentation}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => {
          event.preventDefault();
          void invoke('open_setup_resource', { resource: tool.id }).catch((value) =>
            setError(message(value)),
          );
        }}
      >
        Official guide
        <Icon name="external" size={12} />
      </a>
    ) : null;
  }
  return (
    <section
      className={`tool-launcher rc-tool-launcher ${compact ? 'compact-launcher' : ''}`}
      aria-label="Development tools"
    >
      {!compact && (
        <div className="launcher-toolbar">
          <span className="launcher-section-label">Available tools</span>
          <button
            type="button"
            className="text-button"
            aria-label="Refresh tool detection"
            disabled={detection.loading}
            onClick={detection.refresh}
          >
            <Icon name="refresh" size={14} />
            {detection.loading ? 'Checking...' : 'Refresh'}
          </button>
        </div>
      )}
      <div className="available-tool-list">
        {available.map((tool) => (
          <div className="tool-item available-tool" key={tool.id}>
            <button
              type="button"
              disabled={disabled || !!pending}
              aria-busy={pending === tool.id}
              aria-label={tool.name}
              title={tool.path ? displayPath(tool.path) : undefined}
              onClick={() => void launch(tool.id)}
            >
              <Icon
                name={
                  tool.id === 'folder' ? 'folder' : tool.id === 'terminal' ? 'code' : 'external'
                }
                size={17}
              />
              <span>{pending === tool.id ? 'Opening...' : tool.name}</span>
              {!compact && (
                <small>
                  {tool.id === 'terminal' || ['claude', 'codex', 'agy'].includes(tool.id)
                    ? 'Terminal'
                    : tool.id === 'folder'
                      ? 'File browser'
                      : 'Editor'}
                </small>
              )}
              <Icon name="arrow" size={14} />
            </button>
          </div>
        ))}
      </div>
      {detection.loading && !detection.tools.length && (
        <p className="help" role="status">
          Checking development tools…
        </p>
      )}
      {!detection.loading && !available.length && (
        <p className="help">
          No launch actions confirmed. Review tool locations in project settings.
        </p>
      )}
      {!!other.length && (
        <details className="other-tools">
          <summary>
            Other tools <span>{other.length}</span>
          </summary>
          <div className="other-tool-list">
            {other.map((tool) => (
              <div className={`tool-item other-tool tool-status-${toolState(tool)}`} key={tool.id}>
                <div className="other-tool-identity">
                  <strong>{tool.name}</strong>
                  <span>{toolStatus(tool)}</span>
                  {tool.detail && <p className="help">{displayPath(tool.detail)}</p>}
                  {tool.path && <code>{displayPath(tool.path)}</code>}
                </div>
                <div className="other-tool-actions">
                  {documentation(tool)}
                  {onConfigure && (
                    <button type="button" className="text-button" onClick={onConfigure}>
                      Configure
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
      {(error || detection.error) && (
        <p role="alert" className="field-error">
          {error || detection.error}
        </p>
      )}
    </section>
  );
}

export function CreatedProjectLauncher({
  path,
  onWorkspace,
}: {
  path: string;
  onWorkspace: (id: string) => void;
}) {
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function find() {
      try {
        const history = await invoke<RecentProject[]>('list_recent_projects');
        let project = Array.isArray(history)
          ? history.find((project) => project.context.localPath === path)
          : undefined;
        project ??=
          (await invoke<RecentProject | null>('add_existing_project', { path })) ?? undefined;
        if (active && project) setId(project.id);
      } catch (error) {
        if (active) setError(message(error));
      }
    }
    void find();
    return () => {
      active = false;
    };
  }, [path]);
  return (
    <section className="completion-launcher rc-completion-launcher">
      <div className="view-heading">
        <h3>Start working</h3>
        {id && (
          <button type="button" className="primary" onClick={() => onWorkspace(id)}>
            Open project workspace <Icon name="arrow" size={14} />
          </button>
        )}
      </div>
      {id && <ToolLauncher id={id} compact />}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  );
}

function ProjectSettings({
  project,
  platform: workspacePlatform,
  onChange,
  onRelocate,
}: {
  project: RecentProject;
  platform?: ProjectWorkspaceState['platform'];
  onChange: (project: RecentProject) => void;
  onRelocate: () => void;
}) {
  const [technologies, setTechnologies] = useState(project.technologies);
  const [launcher, setLauncher] = useState(project.launcher);
  const [pinned, setPinned] = useState(project.pinned);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const detection = useProjectTools(project.id);
  const platform =
    workspacePlatform ?? detection.tools.find((tool) => tool.platform)?.platform ?? 'other';
  const terminalChoices =
    platform === 'windows'
      ? [
          ['windows-terminal', 'Windows Terminal'],
          ['powershell', 'PowerShell'],
        ]
      : platform === 'macos'
        ? [['terminal', 'macOS Terminal']]
        : [];
  const overrides = [
    ['vscode', 'VS Code'],
    ['claude', 'Claude Code'],
    ['codex', 'Codex CLI'],
    ['agy', 'Antigravity CLI'],
    ['antigravity-ide', 'Antigravity IDE'],
    ...terminalChoices,
  ];
  for (const [id, name] of [
    ['windows-terminal', 'Windows Terminal'],
    ['powershell', 'PowerShell'],
    ['terminal', 'macOS Terminal'],
  ])
    if (launcher.executables[id] && !overrides.some(([key]) => key === id))
      overrides.push([id, `${name} / saved override`]);
  async function save() {
    setSaving(true);
    try {
      onChange(
        await invoke<RecentProject>('save_project_settings', {
          id: project.id,
          pinned,
          technologies,
          launcher,
        }),
      );
      setStatus('Project preferences saved.');
      setError('');
    } catch (value) {
      setError(message(value));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="project-settings rc-project-settings">
      <div className="view-heading">
        <div>
          <h3>Project settings</h3>
          <p className="help">Local preferences. Your source files stay unchanged.</p>
        </div>
        <button type="button" className="primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving...' : 'Save project settings'}
        </button>
      </div>
      <section className="project-preference-section" aria-labelledby="project-general-heading">
        <div className="preference-section-label">
          <h3 id="project-general-heading">General</h3>
          <p className="help">Identity and project context</p>
        </div>
        <div className="preference-section-fields">
          <label className="check-label">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(event) => setPinned(event.target.checked)}
            />
            Pin this project
          </label>
          <TechnologySelector
            value={technologies}
            onChange={setTechnologies}
            simple
            idPrefix="workspace-technologies"
          />
          <div className="project-location-setting">
            <span>Project location</span>
            <code>{displayPath(project.context.localPath)}</code>
            <button type="button" className="text-button" onClick={onRelocate}>
              Locate moved project
            </button>
          </div>
        </div>
      </section>
      <section className="project-preference-section" aria-labelledby="project-development-heading">
        <div className="preference-section-label">
          <h3 id="project-development-heading">Development environment</h3>
          <p className="help">Automatic detection is the default</p>
        </div>
        <div className="preference-section-fields">
          <label className="field">
            <span>Preferred terminal</span>
            <select
              value={launcher.terminal}
              onChange={(event) =>
                setLauncher({
                  ...launcher,
                  terminal: event.target.value as ProjectLauncher['terminal'],
                })
              }
            >
              <option value="auto">Automatic for this platform</option>
              {terminalChoices.map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
              {launcher.terminal !== 'auto' &&
                !terminalChoices.some(([id]) => id === launcher.terminal) && (
                  <option value={launcher.terminal}>Saved preference / {launcher.terminal}</option>
                )}
            </select>
          </label>
          <div className="environment-tool-summary">
            {detection.tools
              .filter((tool) => !['folder', 'terminal'].includes(tool.id))
              .map((tool) => (
                <span key={tool.id} className={`environment-tool tool-status-${toolState(tool)}`}>
                  <span className="tool-state-dot" />
                  {tool.name}
                  <small>{toolStatus(tool)}</small>
                </span>
              ))}
          </div>
        </div>
      </section>
      <details className="advanced-executables">
        <summary>
          <span>Advanced executable configuration</span>
          <span className="help">Manual paths & discovery details</span>
        </summary>
        <div className="advanced-executable-body">
          <div className="launcher-toolbar">
            <p className="help">
              Absolute paths override discovery. Leave empty for automatic detection.
            </p>
            <button type="button" onClick={detection.refresh} disabled={detection.loading}>
              Refresh detection
            </button>
          </div>
          <div className="executable-grid">
            {overrides.map(([id, name]) => {
              const tool = detection.tools.find((tool) => tool.id === id);
              return (
                <label className="field" key={id}>
                  <span>{name} executable</span>
                  <input
                    value={displayPath(launcher.executables[id] ?? '')}
                    placeholder="Automatic discovery"
                    onChange={(event) => {
                      const executables = { ...launcher.executables };
                      if (event.target.value) executables[id] = event.target.value;
                      else delete executables[id];
                      setLauncher({ ...launcher, executables });
                    }}
                  />
                  {tool && (
                    <span className="help">
                      {toolStatus(tool)}
                      {tool.path
                        ? ` / ${displayPath(tool.path)}`
                        : tool.detail
                          ? ` / ${displayPath(tool.detail)}`
                          : ''}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      </details>
      {status && (
        <p role="status" className="notice">
          {status}
        </p>
      )}
      {(error || detection.error) && (
        <p role="alert" className="field-error">
          {error || detection.error}
        </p>
      )}
    </section>
  );
}

function Commands({
  project,
  exists,
  copy,
  onChange,
  presets,
  onSavePreset,
}: {
  project: RecentProject;
  exists: boolean;
  copy: (text: string) => Promise<void>;
  onChange: (project: RecentProject) => void;
  presets: ProjectPreset[];
  onSavePreset: (commands: ProjectCommand[]) => void;
}) {
  const [editor, setEditor] = useState<ProjectCommand | null>(null);
  const [suggestions, setSuggestions] = useState<ProjectCommand[] | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
  const [runs, setRuns] = useState<CommandRun[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [cleared, setCleared] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<ProjectCommand | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [presetId, setPresetId] = useState('');
  useEffect(() => {
    let active = true,
      fetching = false;
    const poll = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const result = await invoke<CommandRun[]>('list_command_runs', { projectId: project.id });
        if (active) {
          const snapshots = Array.isArray(result)
            ? result.sort((a, b) => b.startedAt - a.startedAt)
            : [];
          setRuns(snapshots);
          const retainedIds = new Set(snapshots.map((run) => run.id));
          setCleared((previous) =>
            Object.keys(previous).every((id) => retainedIds.has(id))
              ? previous
              : Object.fromEntries(Object.entries(previous).filter(([id]) => retainedIds.has(id))),
          );
        }
      } catch (error) {
        if (active) setError(message(error));
      } finally {
        fetching = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 850);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [project.id]);
  const availablePresets = presets.filter(
    (preset) => preset.configuration.options.commands?.length,
  );
  const run = runs.find((run) => run.id === selectedRun) ?? runs[0];
  const visibleOutput = run
    ? cleared[run.id] && run.output.startsWith(cleared[run.id])
      ? run.output.slice(cleared[run.id].length)
      : run.output
    : '';
  async function save(commands: ProjectCommand[]) {
    setPending(true);
    try {
      const result = await invoke<RecentProject>('save_project_commands', {
        id: project.id,
        commands,
      });
      onChange(result);
      setError('');
      return true;
    } catch (error) {
      setError(message(error));
      return false;
    } finally {
      setPending(false);
    }
  }
  async function execute(command: ProjectCommand, confirmed = false) {
    if (command.imported && !confirmed) {
      setError('');
      setConfirmation(command);
      return;
    }
    setPending(true);
    try {
      const result = await invoke<CommandRun>('run_project_command', {
        projectId: project.id,
        commandId: command.id,
        confirmed,
      });
      setRuns((runs) => [result, ...runs.filter((run) => run.id !== result.id)]);
      setSelectedRun(result.id);
      if (command.imported)
        onChange({
          ...project,
          commands: project.commands.map((saved) =>
            saved.id === command.id ? { ...saved, imported: false } : saved,
          ),
        });
      setConfirmation(null);
      setError('');
    } catch (error) {
      setError(message(error));
    } finally {
      setPending(false);
    }
  }
  async function suggest() {
    setPending(true);
    try {
      const result = await invoke<ProjectCommand[]>('suggest_project_commands', { id: project.id });
      setSuggestions(result);
      setSelectedSuggestions(result.map((command) => command.id));
      setError('');
    } catch (error) {
      setError(message(error));
    } finally {
      setPending(false);
    }
  }
  async function stop(run: CommandRun) {
    try {
      await invoke('stop_project_command', { runId: run.id });
    } catch (error) {
      setError(message(error));
    }
  }
  function move(index: number, delta: number) {
    const commands = [...project.commands];
    [commands[index], commands[index + delta]] = [commands[index + delta], commands[index]];
    void save(commands);
  }
  return (
    <section className="commands-workspace">
      <div className="view-heading">
        <div>
          <h3>Project commands</h3>
          <p className="help">Run only when you choose. Output includes stdout and stderr.</p>
        </div>
        <div className="inline-actions">
          <button type="button" disabled={pending || !exists} onClick={() => void suggest()}>
            Discover commands
          </button>
          <button
            type="button"
            className="primary"
            disabled={pending}
            onClick={() =>
              setEditor({
                id: crypto.randomUUID(),
                name: '',
                category: 'custom',
                mode: 'executable',
                executable: '',
                args: [],
                shellCommand: '',
                workingDirectory: '.',
                environment: {},
                description: '',
                enabled: true,
                imported: false,
              })
            }
          >
            Add command
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <div className="command-presets">
        <button
          type="button"
          disabled={!project.commands.length}
          onClick={() => onSavePreset(project.commands)}
        >
          Save commands as preset
        </button>
        {availablePresets.length > 0 && (
          <>
            <select
              aria-label="Command preset"
              value={presetId}
              onChange={(event) => setPresetId(event.target.value)}
            >
              <option value="">Choose command preset…</option>
              {availablePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!presetId || pending}
              onClick={() => {
                const commands =
                  availablePresets.find((preset) => preset.id === presetId)?.configuration.options
                    .commands ?? [];
                setSuggestions(
                  commands.map((command) => ({
                    ...command,
                    id: crypto.randomUUID(),
                    environment: {},
                    imported: true,
                  })),
                );
                setSelectedSuggestions([]);
              }}
            >
              Review preset commands
            </button>
          </>
        )}
      </div>
      <div className="command-layout">
        <div className="command-list">
          {!project.commands.length && (
            <div className="empty-workspace">
              <Icon name="code" size={27} />
              <h3>No commands configured</h3>
              <p className="help">
                Add a command, or inspect the project's manifests for suggestions. Discovery does
                not execute scripts.
              </p>
            </div>
          )}
          {project.commands.map((command, index) => {
            const running = runs.find(
              (run) => run.commandId === command.id && run.status === 'running',
            );
            const latest = runs.find((run) => run.commandId === command.id);
            return (
              <article
                className={`command-card ${!command.enabled ? 'disabled-command' : ''}`}
                key={command.id}
              >
                <div className="command-card-heading">
                  <span className="command-category">{command.category}</span>
                  {latest && (
                    <span className={`command-last-status status-${latest.status}`}>
                      {latest.status}
                      {latest.exitCode !== null ? ` / exit ${latest.exitCode}` : ''}
                    </span>
                  )}
                  {command.imported && (
                    <span className="unreviewed-label">Review before first run</span>
                  )}
                  {!command.enabled && <span className="help">Disabled</span>}
                </div>
                <h4>{command.name}</h4>
                <code className="saved-command-text">{presentedCommand(command)}</code>
                <p className="command-working-directory">
                  <Icon name="folder" size={12} />
                  <span
                    title={displayPath(
                      commandDirectory(project.context.localPath, command.workingDirectory),
                    )}
                  >
                    {displayPath(
                      commandDirectory(project.context.localPath, command.workingDirectory),
                    )}
                  </span>
                  <span className="command-mode-label">
                    {command.mode === 'shell' ? 'Shell' : 'Executable'}
                  </span>
                </p>
                {command.description && <p className="help">{command.description}</p>}
                <div className="command-card-actions">
                  <div className="inline-actions">
                    {running ? (
                      <button
                        type="button"
                        className="command-stop"
                        onClick={() => void stop(running)}
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!exists || !command.enabled || pending}
                        className="run-button primary"
                        onClick={() => void execute(command)}
                      >
                        Run <Icon name="arrow" size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={pending || !!running}
                      onClick={() => setEditor(structuredClone(command))}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending || !!running}
                      onClick={() =>
                        void save(project.commands.filter((item) => item.id !== command.id))
                      }
                    >
                      Delete
                    </button>
                  </div>
                  <div className="command-reorder">
                    <button
                      type="button"
                      aria-label={`Move ${command.name} up`}
                      disabled={!index || pending}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${command.name} down`}
                      disabled={index === project.commands.length - 1 || pending}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <section className="command-output" aria-label="Command output">
          <div className="output-toolbar">
            <span className="output-title">
              <Icon name="code" size={15} />
              Output
            </span>
            {runs.length > 0 && (
              <select
                aria-label="Select command run"
                value={run?.id ?? ''}
                onChange={(event) => setSelectedRun(event.target.value)}
              >
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.name} · {run.status}
                  </option>
                ))}
              </select>
            )}
          </div>
          {run ? (
            <>
              <div className="run-summary">
                <strong>{run.name}</strong>
                <span className={`run-status status-${run.status}`}>{run.status}</span>
                <span>
                  {Math.max(0, Math.floor(((run.finishedAt ?? Date.now()) - run.startedAt) / 1000))}
                  s{run.exitCode !== null ? ` · exit ${run.exitCode}` : ''}
                </span>
              </div>
              <pre className="run-output" tabIndex={0} aria-label={`${run.name} output`}>
                {visibleOutput || (run.status === 'running' ? 'Waiting for output…' : 'No output.')}
              </pre>
              <div className="output-actions">
                <button type="button" onClick={() => void copy(visibleOutput)}>
                  Copy output
                </button>
                <button
                  type="button"
                  onClick={() => setCleared({ ...cleared, [run.id]: run.output })}
                >
                  Clear output
                </button>
                {run.status === 'running' && (
                  <button type="button" onClick={() => void stop(run)}>
                    Stop process
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="output-empty">
              <Icon name="code" size={22} />
              <p>Command output appears here.</p>
            </div>
          )}
          <div className="output-terminal">
            <p className="help">For interactive tools, use a real terminal.</p>
            <button
              type="button"
              disabled={!exists}
              onClick={() =>
                void invoke('launch_project_tool', { id: project.id, tool: 'terminal' }).catch(
                  (error) => setError(message(error)),
                )
              }
            >
              Open in Terminal <Icon name="external" size={12} />
            </button>
          </div>
        </section>
      </div>
      {editor && (
        <CommandEditor
          command={editor}
          nativeError={error}
          pending={pending}
          onClose={() => setEditor(null)}
          onSave={async (command) => {
            const commands = project.commands.some((item) => item.id === command.id)
              ? project.commands.map((item) => (item.id === command.id ? command : item))
              : [...project.commands, command];
            if (await save(commands)) setEditor(null);
          }}
        />
      )}
      {suggestions !== null && (
        <WorkspaceDialog title="Review suggested commands" onClose={() => setSuggestions(null)}>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <p className="help">
            These commands are untrusted until you review their first execution. Nothing runs during
            import.
          </p>
          {!suggestions.length && <p>No commands found in supported manifests.</p>}
          <div className="suggestion-list">
            {suggestions.map((command) => (
              <label className="suggested-command" key={command.id}>
                <input
                  type="checkbox"
                  checked={selectedSuggestions.includes(command.id)}
                  onChange={(event) =>
                    setSelectedSuggestions(
                      event.target.checked
                        ? [...selectedSuggestions, command.id]
                        : selectedSuggestions.filter((id) => id !== command.id),
                    )
                  }
                />
                <span>
                  <strong>{command.name}</strong>
                  <code>{presentedCommand(command)}</code>
                  <small>
                    Directory:{' '}
                    {displayPath(
                      commandDirectory(project.context.localPath, command.workingDirectory),
                    )}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={() => setSuggestions(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={pending || !selectedSuggestions.length}
              onClick={() =>
                void save([
                  ...project.commands,
                  ...suggestions
                    .filter((command) => selectedSuggestions.includes(command.id))
                    .map((command) => ({ ...command, id: crypto.randomUUID(), imported: true })),
                ]).then((saved) => {
                  if (saved) setSuggestions(null);
                })
              }
            >
              Import selected commands
            </button>
          </div>
        </WorkspaceDialog>
      )}
      {confirmation && (
        <WorkspaceDialog title="Review imported command" onClose={() => setConfirmation(null)}>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <p>This command came from a manifest or preset. Review it before allowing execution.</p>
          <dl className="workspace-facts command-review">
            <dt>Command</dt>
            <dd>
              <code>{presentedCommand(confirmation)}</code>
            </dd>
            <dt>Mode</dt>
            <dd>
              {confirmation.mode === 'shell'
                ? 'Shell command — shell syntax is evaluated'
                : 'Executable with separate arguments'}
            </dd>
            <dt>Directory</dt>
            <dd>
              <code>
                {displayPath(
                  commandDirectory(project.context.localPath, confirmation.workingDirectory),
                )}
              </code>
            </dd>
            <dt>Environment</dt>
            <dd>{Object.keys(confirmation.environment).join(', ') || 'Inherited environment'}</dd>
          </dl>
          <div className="dialog-actions">
            <button type="button" onClick={() => setConfirmation(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={pending}
              onClick={() => void execute(confirmation, true)}
            >
              Run reviewed command
            </button>
          </div>
        </WorkspaceDialog>
      )}
    </section>
  );
}

function WorkspaceDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="workspace-dialog rc-workspace-dialog"
      ref={dialog}
      onCancel={onClose}
      aria-label={title}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <Icon name="close" size={17} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function CommandEditor({
  command,
  nativeError,
  pending,
  onClose,
  onSave,
}: {
  command: ProjectCommand;
  nativeError: string;
  pending: boolean;
  onClose: () => void;
  onSave: (command: ProjectCommand) => Promise<void>;
}) {
  const [draft, setDraft] = useState(command);
  const [argumentsText, setArgumentsText] = useState(command.args.join('\n'));
  const [environmentText, setEnvironmentText] = useState(
    Object.entries(command.environment)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
  const [error, setError] = useState('');
  function update<K extends keyof ProjectCommand>(key: K, value: ProjectCommand[K]) {
    setDraft({ ...draft, [key]: value });
  }
  function save() {
    const environment: Record<string, string> = {};
    for (const line of environmentText.split('\n').filter((line) => line.trim())) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
      if (!match) {
        setError('Use NAME=value for each environment override.');
        return;
      }
      environment[match[1]] = match[2];
    }
    if (
      !draft.name.trim() ||
      !(draft.mode === 'shell' ? draft.shellCommand.trim() : draft.executable.trim())
    ) {
      setError('Enter a display name and command.');
      return;
    }
    void onSave({
      ...draft,
      name: draft.name.trim(),
      args: argumentsText ? argumentsText.split('\n') : [],
      environment,
    });
  }
  return (
    <WorkspaceDialog title={command.name ? 'Edit command' : 'Add command'} onClose={onClose}>
      <div className="command-editor">
        <div className="two-columns">
          <label className="field">
            <span>Display name</span>
            <input
              autoFocus
              value={draft.name}
              maxLength={120}
              onChange={(event) => update('name', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Category</span>
            <select
              value={draft.category}
              onChange={(event) => update('category', event.target.value as CommandCategory)}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="segmented" role="group" aria-label="Command launch mode">
          <button
            type="button"
            aria-pressed={draft.mode === 'executable'}
            onClick={() => update('mode', 'executable')}
          >
            Executable & arguments
          </button>
          <button
            type="button"
            aria-pressed={draft.mode === 'shell'}
            onClick={() => update('mode', 'shell')}
          >
            Shell command
          </button>
        </div>
        {draft.mode === 'executable' ? (
          <>
            <label className="field">
              <span>Executable</span>
              <input
                value={displayPath(draft.executable)}
                placeholder="npm, cargo, or an executable path"
                onChange={(event) => update('executable', event.target.value)}
              />
            </label>
            <label className="field">
              <span>Arguments · one per line</span>
              <textarea
                rows={3}
                value={argumentsText}
                onChange={(event) => setArgumentsText(event.target.value)}
                placeholder={'run\ndev'}
              />
            </label>
            <p className="help">
              Each line is one literal argument. Shell operators and quotes are not interpreted.
            </p>
          </>
        ) : (
          <>
            <label className="field">
              <span>Shell command</span>
              <textarea
                rows={3}
                value={draft.shellCommand}
                onChange={(event) => update('shellCommand', event.target.value)}
              />
            </label>
            <p className="help">
              Evaluated by PowerShell on Windows or the system shell on macOS. Use shell syntax
              appropriate to this computer.
            </p>
          </>
        )}
        <label className="field">
          <span>Working directory</span>
          <input
            aria-label="Working directory"
            value={displayPath(draft.workingDirectory)}
            placeholder=". (project folder)"
            onChange={(event) => update('workingDirectory', event.target.value)}
          />
          <span className="help">
            A path relative to the project, or an absolute existing directory.
          </span>
        </label>
        <label className="field">
          <span>Environment overrides · non-secret values only</span>
          <textarea
            rows={3}
            value={environmentText}
            placeholder="NODE_ENV=development"
            onChange={(event) => setEnvironmentText(event.target.value)}
          />
          <span className="help">
            NAME=value, one per line. Stored locally in plain text; do not enter tokens or
            passwords. Exports omit these values.
          </span>
        </label>
        <label className="field">
          <span>Description</span>
          <input
            value={draft.description}
            maxLength={500}
            onChange={(event) => update('description', event.target.value)}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => update('enabled', event.target.checked)}
          />
          Enabled
        </label>
        {(error || nativeError) && (
          <p role="alert" className="field-error">
            {error || nativeError}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={pending} onClick={save}>
            Save command
          </button>
        </div>
      </div>
    </WorkspaceDialog>
  );
}
