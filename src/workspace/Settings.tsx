import { Button } from '../ui';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { displayPath } from '../validation';
import { TechnologySelector } from '../WorkspaceFields';
import { DetectedTechnologies } from '../DetectedTechnologies';
import {
  type ProjectLauncher,
  type ProjectWorkspaceState,
  type RecentProject,
} from '../workspaceTypes';
import { message } from './shared';
import { toolState, toolStatus, useProjectTools } from './Tools';
export function ProjectSettings({
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
        <Button type="button" variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving...' : 'Save project settings'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {saving && (
        <p role="status" className="help">
          Saving project settings…
        </p>
      )}
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
            onChange={(value) => {
              setTechnologies(value);
              setStatus('Unsaved changes. Use Save project settings to keep them.');
            }}
            simple
            idPrefix="workspace-technologies"
            extraControl={
              <DetectedTechnologies
                projectId={project.id}
                value={technologies}
                onChange={(value) => {
                  setTechnologies(value);
                  setStatus('Unsaved changes. Use Save project settings to keep them.');
                }}
              />
            }
          />
          <div className="project-location-setting">
            <span>Project location</span>
            <code>{displayPath(project.context.localPath)}</code>
            <Button type="button" variant="tertiary" size="compact" onClick={onRelocate}>
              Locate moved project
            </Button>
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
      {detection.error && (
        <p role="alert" className="field-error">
          {detection.error}
        </p>
      )}
    </section>
  );
}
