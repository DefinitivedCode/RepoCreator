import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '../icons';
import { displayPath } from '../validation';
import { type ProjectTool, type RecentProject } from '../workspaceTypes';
import { message } from './shared';
export function toolState(tool: ProjectTool): string {
  return tool.status ?? (tool.available ? 'available' : 'unknown');
}
export function toolStatus(tool: ProjectTool): string {
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
export function useProjectTools(id: string, enabled = true) {
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
    if (enabled) void detect();
    return () => {
      request.current++;
    };
  }, [id, enabled]);
  return { tools, loading, error, refresh: () => void detect(true) };
}

export function ToolLauncher({
  id,
  disabled = false,
  compact = false,
  onConfigure,
  detection: shared,
}: {
  id: string;
  disabled?: boolean;
  compact?: boolean;
  onConfigure?: () => void;
  /** Detection shared with a parent, so one view makes one detection call. */
  detection?: ReturnType<typeof useProjectTools>;
}) {
  const own = useProjectTools(id, !shared);
  const detection = shared ?? own;
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
