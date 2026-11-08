import type { ProjectPreset } from '../types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TabList, panelIdOf, tabId } from '../ui/Tabs';
import { Icon } from '../icons';
import { Readiness, readinessChecks, useReadiness } from '../Readiness';
import { countLabel, summarize } from '../readinessModel';
import { displayPath } from '../validation';
import { PromptWorkspace } from '../HandoffPanel';
import { technologySummary } from '../technologies';
import { type ProjectCommand, type ProjectWorkspaceState } from '../workspaceTypes';
import { date, gitLabel, message, normalize } from './shared';
import { ToolLauncher } from './Tools';
import { ProjectSettings } from './Settings';
import { Commands } from './Commands';
export function ProjectWorkspace({
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
  const workspaceRevision = useRef(0);
  const workspaceRequest = useRef<Promise<ProjectWorkspaceState> | null>(null);
  const refresh = useCallback(async () => {
    const revision = ++workspaceRevision.current;
    const request = (workspaceRequest.current ??= invoke<ProjectWorkspaceState>(
      'get_project_workspace',
      { id },
    ));
    try {
      const result = await request;
      if (revision !== workspaceRevision.current) return;
      setWorkspace({ ...result, project: normalize(result.project) });
      setError('');
    } catch (error) {
      if (revision === workspaceRevision.current) setError(message(error));
    } finally {
      if (workspaceRequest.current === request) workspaceRequest.current = null;
    }
  }, [id]);
  useEffect(() => {
    void refresh();
    return () => {
      workspaceRevision.current++;
    };
  }, [refresh]);
  async function relocate() {
    try {
      if (await invoke('relocate_project', { id })) await refresh();
    } catch (error) {
      setError(message(error));
    }
  }
  const project = workspace?.project;
  const readiness = useReadiness(project, !!workspace?.exists);
  const attention = workspace ? summarize(readinessChecks(readiness, workspace)).attention : 0;
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
            <nav aria-label="Breadcrumb" className="library-breadcrumb">
              <button
                type="button"
                className="text-button library-back"
                onClick={onBack}
                aria-label="All projects"
              >
                <Icon name="chevron" size={17} />
                <span aria-hidden="true" className="library-back-label">
                  Projects
                </span>
              </button>
            </nav>
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
          <TabList
            base="project-workspace"
            className="workspace-tabs"
            label="Project workspace sections"
            value={tab}
            onChange={(value) => {
              setTab(value);
              setHandoff(false);
            }}
            items={[
              { id: 'overview', label: 'Overview' },
              { id: 'open', label: 'Open' },
              { id: 'commands', label: 'Commands' },
              {
                id: 'readiness',
                label: 'Readiness',
                badge: attention,
                accessibleName:
                  attention > 0 ? `Readiness, ${countLabel('attention', attention)}` : undefined,
              },
              { id: 'settings', label: 'Project Settings' },
            ]}
          />
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
          <div
            className="project-view"
            role="tabpanel"
            id={panelIdOf('project-workspace')}
            aria-labelledby={tabId('project-workspace', tab)}
          >
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
                    {!project.technologies.ids.length && !project.technologies.custom.length && (
                      <p className="help">
                        Technologies haven't been selected yet.{' '}
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setTab('settings')}
                        >
                          Detect them from project files
                        </button>
                      </p>
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
            {tab === 'readiness' && (
              <Readiness
                project={project}
                workspace={workspace}
                readiness={readiness}
                copy={copy}
                onOpenCommands={() => setTab('commands')}
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
