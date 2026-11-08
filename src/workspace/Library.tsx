import type { ProjectPreset } from '../types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '../icons';
import { displayPath } from '../validation';
import { technologySummary } from '../technologies';
import { type ProjectCommand, type RecentProject } from '../workspaceTypes';
import { date, message, normalize } from './shared';
import { ProjectWorkspace } from './Workspace';
import '../project-workspace.css';

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
  const loadRevision = useRef(0);
  const libraryRequest = useRef<Promise<RecentProject[]> | null>(null);
  const load = useCallback(async (fresh = false) => {
    const revision = ++loadRevision.current;
    setLoading(true);
    const request =
      fresh || !libraryRequest.current
        ? (libraryRequest.current = invoke<RecentProject[]>('list_recent_projects'))
        : libraryRequest.current;
    try {
      const result = await request;
      if (revision !== loadRevision.current) return;
      setProjects(Array.isArray(result) ? result.map(normalize) : []);
      setError('');
    } catch (error) {
      if (revision === loadRevision.current) setError(message(error));
    } finally {
      if (libraryRequest.current === request) libraryRequest.current = null;
      if (revision === loadRevision.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    // The workspace fetches its own project. Reload history only on the library
    // screen, including a fresh read when returning from an edited workspace.
    if (!initialProjectId) void load();
    else libraryRequest.current = null;
    return () => {
      loadRevision.current++;
    };
  }, [initialProjectId, load]);
  async function add() {
    setPending(true);
    try {
      const result = await invoke<RecentProject | null>('add_existing_project');
      if (result) {
        await load(true);
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
