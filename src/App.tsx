import { useEffect, useReducer, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from './icons';
import { AdvancedPanel, FilePreview, IgnorePanel, type FileSection } from './ConfigurationPanels';
import { PresetDialog } from './PresetDialog';
import { FocusedFilePreview } from './FocusedFilePreview';
import { GeneratedFilesDialog } from './GeneratedFilesDialog';
import { AgentStudio, type AgentSection } from './AgentStudio';
import { HandoffPanel } from './HandoffPanel';
import { WorkspaceDialog } from './WorkspaceDialog';
import { PresetLibrary } from './presets/PresetLibrary';
import { BlockerPopover, ConfirmPublish } from './create/CreateFlow';
import { Projects } from './ProjectWorkspace';
import type { ProjectCommand } from './workspaceTypes';
import { RepositoryState } from './RepositoryState';
import { Overview, ProjectSummary, SetupPanel, Context } from './WorkspaceFields';
import { Sidebar } from './shell/Sidebar';
import { initialRoute, routeReducer, type SettingsTarget } from './shell/route';
import { TabList, panelIdOf, tabId } from './ui/Tabs';
import './shell/shell.css';
import './settings.css';
import './forced-colors.css';
import { useCreator } from './useCreator';
import { useUpdates } from './useUpdates';
import { configurationOf } from './validation';
import { isSetupBlocker, requiredSetupMet, summarizeBlockers, type FixTarget } from './blockers';
import { SetupChecklist } from './setup/SetupChecklist';
import type { RecentProject } from './workspaceTypes';
import type { Configuration, Readme } from './types';
import { normalizeProjectName } from './projectName';

export type Section = 'overview' | 'files' | 'agents' | 'review' | 'handoff';
const labels: Record<Section, string> = {
  overview: 'Overview',
  files: 'Project Files',
  agents: 'AI Agents',
  review: 'Review',
  handoff: 'AI Handoff',
};

export default function App() {
  const creator = useCreator();
  const { form, catalog, preferences, state } = creator;
  const updates = useUpdates(preferences);
  const [updateRequest, setUpdateRequest] = useState(0);
  const [section, setSection] = useState<Section>('overview');
  const [route, navigateTo] = useReducer(routeReducer, initialRoute);
  const { page, tab: settingsTab, projectId: selectedProjectId } = route;
  const [presetOverride, setPresetOverride] = useState<Configuration>();
  const [fileSection, setFileSection] = useState<FileSection | 'ignore'>('readme');
  const [agentSection, setAgentSection] = useState<AgentSection>('assistants');
  const [presetId, setPresetId] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [blockersOpen, setBlockersOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const createButton = useRef<HTMLButtonElement>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ configuration: Configuration; id: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // First run: no completed setup and no projects yet. People upgrading with projects
  // are never interrupted: setup completes silently when the required items pass.
  const [hasProjects, setHasProjects] = useState<boolean | null>(null);
  const onboardingDone = !!preferences?.onboarding?.completedAt;
  useEffect(() => {
    if (!preferences || onboardingDone || hasProjects !== null) return;
    invoke<RecentProject[]>('list_recent_projects')
      .then((projects) => setHasProjects(projects.length > 0))
      .catch(() => setHasProjects(true));
  }, [preferences, onboardingDone, hasProjects]);
  const firstRun = !!preferences && !onboardingDone && hasProjects === false;
  useEffect(() => {
    if (
      preferences &&
      !onboardingDone &&
      hasProjects === true &&
      creator.environment &&
      !creator.checking &&
      requiredSetupMet(creator.blockers)
    )
      void creator.completeOnboarding().catch(() => undefined);
  }, [
    preferences,
    onboardingDone,
    hasProjects,
    creator.environment,
    creator.checking,
    creator.blockers,
  ]);
  // Recheck when the window regains focus while first-run setup is unresolved.
  const lastFocusCheck = useRef(0);
  useEffect(() => {
    if (!firstRun) return;
    const onFocus = () => {
      const now = Date.now();
      if (creator.checking || now - lastFocusCheck.current < 3000) return;
      lastFocusCheck.current = now;
      void creator.refresh(false);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [firstRun, creator.checking, creator.refresh]);
  const simple = preferences?.experienceMode !== 'advanced';
  const contextualFiles = section === 'files' || section === 'agents' || section === 'review';
  const showContext = contextOpen && !contextualFiles;
  const allPresets = [...(catalog?.builtInPresets ?? []), ...(preferences?.customPresets ?? [])];
  const preset = allPresets.find((p) => p.id === presetId);
  const presetName = preset?.name ?? 'Last used settings';
  const requiredBlockers = creator.blockers.filter((blocker) => blocker.required);
  const summary = summarizeBlockers(creator.blockers);
  const firstSetupBlocker = requiredBlockers.find(isSetupBlocker);
  // An inline fix is shown only when one thing needs doing; several get a list.
  const inlineFix = requiredBlockers.length <= 1 ? summary.first?.fix : undefined;
  function openSettings(tab?: SettingsTarget) {
    navigateTo({ type: 'settings', tab });
  }
  function runFix(target: FixTarget) {
    if (target === 'settings-git') openSettings('git');
    else if (target === 'settings-github') openSettings('github');
    else if (target === 'choose-location') void creator.chooseFolder();
    else if (target === 'switch-local') void creator.destination('local');
    else void creator.refresh(form?.destination === 'github');
  }
  function navigate(next: Section) {
    setSection(next);
    requestAnimationFrame(() => {
      heading.current?.focus();
      document.querySelector('.workspace-main')?.scrollTo(0, 0);
    });
  }
  function apply(configuration: Configuration, id: string) {
    if (form) setUndo({ configuration: structuredClone(configurationOf(form)), id: presetId });
    if (state.kind !== 'form') creator.reset();
    creator.configure(configuration);
    setPresetId(id);
    if (page !== 'new') {
      navigateTo({ type: 'go', page: 'new' });
      navigate('overview');
    }
  }
  if (firstRun)
    return (
      <div className="app desktop-app first-run-app">
        <main className="first-run" aria-label="Welcome">
          <h1 className="first-run-title">Welcome to Repo Creator</h1>
          <p className="help">
            Create a Git repository with the right files in a few clicks. Everything runs on this
            computer; GitHub is optional.
          </p>
          <SetupChecklist
            creator={creator}
            variant="first-run"
            onCreate={() => {
              void creator.completeOnboarding();
            }}
            onAddExisting={() => {
              void (async () => {
                await creator.completeOnboarding();
                const added = await invoke<RecentProject | null>('add_existing_project').catch(
                  () => null,
                );
                if (added) navigateTo({ type: 'open-project', id: added.id });
              })();
            }}
          />
        </main>
      </div>
    );
  return (
    <div className="app desktop-app" data-page={page} data-section={section}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar
        version={updates.info?.currentVersion}
        page={page}
        disabled={creator.busy}
        setupNeedsAttention={!!creator.environment && !creator.checking && !creator.setupReady}
        updateAvailable={!!updates.offer}
        onNavigate={(id) => {
          if (id === 'new' && state.kind !== 'form') {
            creator.reset();
            navigate('overview');
          }
          navigateTo({ type: 'go', page: id });
        }}
        onReviewUpdate={() => {
          setUpdateRequest((value) => value + 1);
          navigateTo({ type: 'settings' });
        }}
      />
      <div className="app-content" id="main-content" tabIndex={-1}>
        {updates.offer && !updates.dismissed && page !== 'settings' && (
          <aside className="update-notification" aria-label="Software update">
            <span>Repo Creator {updates.offer.version} is available.</span>
            <button
              type="button"
              onClick={() => {
                setUpdateRequest((value) => value + 1);
                navigateTo({ type: 'settings' });
              }}
            >
              Review update
            </button>
            <button type="button" onClick={updates.later}>
              Later
            </button>
          </aside>
        )}
        {!form || !catalog || !preferences ? (
          <main className="content">
            <p role="status">{creator.notice || creator.error?.message || 'Loading settings…'}</p>
            {creator.error && (
              <>
                <p className="help">{creator.error.guidance}</p>
                <button type="button" onClick={() => window.location.reload()}>
                  Retry loading settings
                </button>
              </>
            )}
          </main>
        ) : page === 'projects' ? (
          <Projects
            initialProjectId={selectedProjectId}
            onSelect={(id) => navigateTo({ type: 'select-project', id })}
            copy={creator.copy}
            commandPresets={allPresets}
            onNew={() => navigateTo({ type: 'go', page: 'new' })}
            onSaveCommandPreset={(commands: ProjectCommand[]) => {
              setPresetOverride({
                ...configurationOf(form),
                options: { ...form.options, commands },
              });
              setPresetsOpen(true);
            }}
          />
        ) : page === 'presets' ? (
          <PresetLibrary
            creator={creator}
            presets={allPresets}
            onManage={() => setPresetsOpen(true)}
            onUse={(configuration, id) => {
              apply(configuration, id);
              navigateTo({ type: 'go', page: 'new' });
              navigate('overview');
            }}
          />
        ) : page === 'settings' ? (
          <main className="library-page settings-page" aria-label="Application settings">
            <div className="page-heading">
              <div>
                <h2>Settings</h2>
                <p
                  className="help git-readiness"
                  data-ready={!creator.checking && creator.setupReady}
                  role="status"
                >
                  <span className="status-dot" aria-hidden="true" />
                  {creator.checking
                    ? 'Checking setup…'
                    : creator.setupReady
                      ? 'Git ready'
                      : 'Setup incomplete'}
                </p>
              </div>
            </div>
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
            <SetupPanel
              creator={creator}
              updates={updates}
              updateRequest={updateRequest}
              initialTab={settingsTab}
              onReturn={() => {
                navigateTo({ type: 'go', page: 'new' });
                navigate('overview');
              }}
            />
          </main>
        ) : state.kind !== 'form' ? (
          <RepositoryState
            creator={creator}
            presetName={presetName}
            onWorkspace={(id) => {
              navigateTo({ type: 'open-project', id });
            }}
            onAnother={() => {
              creator.reset();
              navigate('overview');
            }}
          />
        ) : (
          <form
            className="workspace-form"
            onSubmit={(e) => {
              e.preventDefault();
              // The Create button stays focusable when unavailable; it explains instead.
              if (!creator.ready) {
                setBlockersOpen(true);
                return;
              }
              if (section !== 'review') navigate('review');
              else if (form.destination === 'github') setConfirmOpen(true);
              else void creator.execute(false, presetName);
            }}
          >
            <div className={`workspace ${showContext ? 'with-context' : ''}`}>
              <nav className="navigation-rail" aria-label="Project setup">
                <span className="nav-caption">Project setup</span>
                {(Object.keys(labels) as Section[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`nav-item ${section === s ? 'active' : ''}`}
                    aria-current={section === s ? 'page' : undefined}
                    onClick={() => navigate(s)}
                  >
                    <Icon
                      name={
                        s === 'files' || s === 'review'
                          ? 'file'
                          : s === 'agents' || s === 'handoff'
                            ? 'code'
                            : 'folder'
                      }
                      size={15}
                    />
                    {labels[s]}
                  </button>
                ))}
              </nav>
              <main className="workspace-main" aria-label="Repository configuration" tabIndex={0}>
                <div className="workspace-heading">
                  <div>
                    <h2 ref={heading} tabIndex={-1}>
                      {labels[section]}
                    </h2>
                  </div>
                  {!contextualFiles && (
                    <div className="workspace-heading-actions">
                      <button
                        type="button"
                        className="text-button compact-preview-trigger"
                        aria-haspopup="dialog"
                        onClick={() => setPreviewPath('README.md')}
                      >
                        <Icon name="file" size={14} /> Preview files
                      </button>
                      <button
                        type="button"
                        className="text-button context-toggle"
                        aria-pressed={contextOpen}
                        onClick={() => setContextOpen(!contextOpen)}
                      >
                        {contextOpen ? 'Hide details' : 'Show details'}
                      </button>
                    </div>
                  )}
                </div>
                {requiredBlockers.length > 1 && (
                  <div
                    className="error-banner blocker-list"
                    role="group"
                    aria-label="To create this project"
                  >
                    <strong>{requiredBlockers.length} things to fix</strong>
                    <ul>
                      {requiredBlockers.map((blocker) => (
                        <li key={blocker.id}>
                          <span>{blocker.title}</span>{' '}
                          {blocker.fix && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => runFix(blocker.fix!.target)}
                            >
                              {blocker.fix.label}
                            </button>
                          )}
                          {blocker.alternative && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => runFix(blocker.alternative!.target)}
                            >
                              {blocker.alternative.label}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <fieldset disabled={creator.picking || creator.busy} className="workspace-fields">
                  {section === 'overview' && (
                    <>
                      <Overview
                        creator={creator}
                        simple={simple}
                        presetId={presetId}
                        onApply={apply}
                        onManage={() => setPresetsOpen(true)}
                        onAgents={() => navigate('agents')}
                        canUndo={!!undo}
                        onUndo={() => {
                          if (!undo) return;
                          creator.configure(undo.configuration, false);
                          setPresetId(undo.id);
                          setUndo(null);
                        }}
                      />
                    </>
                  )}
                  {section === 'files' && (
                    <>
                      <Subnav
                        base="file-settings"
                        label="Project file settings"
                        value={fileSection}
                        items={[
                          ['readme', 'README'],
                          ['ignore', 'Gitignore'],
                          ['license', 'License'],
                          ['additional', 'Additional Files'],
                          ['git', 'Git Settings'],
                        ]}
                        onChange={(v) => setFileSection(v as typeof fileSection)}
                      />
                      <div
                        role="tabpanel"
                        id={panelIdOf('file-settings')}
                        aria-labelledby={tabId('file-settings', fileSection)}
                        className={`file-editor-layout ${fileSection === 'git' ? 'git-configuration' : ''}`}
                      >
                        <div className="file-configuration">
                          {fileSection === 'readme' && (
                            <label className="field">
                              <span className="control-label">README</span>
                              <select
                                value={form.readme}
                                onChange={(e) => creator.update('readme', e.target.value as Readme)}
                              >
                                {['none', 'minimal', 'general', 'custom'].map((r) => (
                                  <option key={r} value={r}>
                                    {r[0].toUpperCase() + r.slice(1)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {fileSection === 'ignore' ? (
                            <IgnorePanel
                              creator={creator}
                              recommendation={preset?.configuration.options.ignorePresets}
                            />
                          ) : (
                            <AdvancedPanel creator={creator} section={fileSection} />
                          )}
                        </div>
                        {fileSection !== 'git' ? (
                          <FocusedFilePreview
                            key={fileSection}
                            creator={creator}
                            paths={
                              fileSection === 'readme'
                                ? ['README.md']
                                : fileSection === 'ignore'
                                  ? ['.gitignore']
                                  : fileSection === 'license'
                                    ? ['LICENSE']
                                    : ['.editorconfig', '.gitattributes']
                            }
                            title="File contents"
                          />
                        ) : (
                          <section className="commit-plan" aria-label="Initial commit plan">
                            <Icon name="repo" size={22} />
                            <h3>First commit</h3>
                            <p className="commit-plan-branch">
                              <code>{form.options.initialBranch}</code>
                            </p>
                            <strong>{form.options.commitMessage}</strong>
                            <span className="help">{creator.files.length} generated files</span>
                            <p className="help">These settings apply to the new repository.</p>
                          </section>
                        )}
                      </div>
                    </>
                  )}
                  {section === 'agents' && (
                    <>
                      <Subnav
                        base="agent-settings"
                        label="AI agent settings"
                        value={agentSection}
                        items={[
                          ['assistants', 'Assistants'],
                          ['instructions', 'Instructions'],
                          ['specialists', 'Specialists & Skills'],
                          ['advanced', 'Advanced'],
                        ]}
                        onChange={(v) => setAgentSection(v as AgentSection)}
                      />
                      <div
                        role="tabpanel"
                        id={panelIdOf('agent-settings')}
                        aria-labelledby={tabId('agent-settings', agentSection)}
                        className={`agent-editor-layout ${agentSection === 'instructions' ? 'with-instruction-preview' : ''}`}
                      >
                        <AgentStudio creator={creator} section={agentSection} />
                        {agentSection === 'instructions' && (
                          <FocusedFilePreview
                            creator={creator}
                            paths={['AGENTS.md']}
                            title="Shared instruction preview"
                          />
                        )}
                      </div>
                    </>
                  )}
                  {section === 'review' && (
                    <>
                      <div className="review-editor-layout">
                        <section className="review-summary-card">
                          <h3>Ready to create</h3>
                          <ProjectSummary creator={creator} presetName={presetName} />
                          <p className="help">Creates a new folder and initial commit.</p>
                        </section>
                        <FilePreview
                          name={normalizeProjectName(form.name) || 'project-name'}
                          files={creator.files}
                          loading={creator.previewing}
                          error={creator.previewError}
                          expanded
                        />
                      </div>
                      {firstSetupBlocker?.fix && (
                        <button type="button" onClick={() => runFix(firstSetupBlocker.fix!.target)}>
                          {firstSetupBlocker.title}
                        </button>
                      )}
                    </>
                  )}
                  {section === 'handoff' && (
                    <HandoffPanel
                      form={form}
                      files={creator.files}
                      parentPath={preferences.parentPath}
                      presetName={presetName}
                      simple={simple}
                      onTemplateChange={(id) => creator.update('handoffTemplate', id)}
                      copy={creator.copy}
                    />
                  )}
                </fieldset>
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
              </main>
              {showContext && (
                <aside className="context-panel" aria-label="Project context">
                  <Context
                    creator={creator}
                    section={section}
                    presetName={presetName}
                    presetDescription={preset?.description}
                    fileSection={fileSection}
                    onPreview={setPreviewPath}
                    onHandoff={() => setHandoffOpen(true)}
                  />
                </aside>
              )}
            </div>
            {drawerOpen && (
              <section className="result-drawer" id="result-drawer" aria-label="Result preview">
                <Context
                  creator={creator}
                  section={section}
                  presetName={presetName}
                  presetDescription={preset?.description}
                  fileSection={fileSection}
                  onPreview={setPreviewPath}
                  onHandoff={() => setHandoffOpen(true)}
                />
              </section>
            )}
            {blockersOpen && !creator.ready && (
              <BlockerPopover
                blockers={requiredBlockers.length ? requiredBlockers : creator.blockers}
                onFix={(fix) => runFix(fix.target)}
                onClose={() => {
                  setBlockersOpen(false);
                  createButton.current?.focus();
                }}
              />
            )}
            {confirmOpen && (
              <ConfirmPublish
                owner={form.githubOwner || creator.environment?.githubUser || ''}
                name={normalizeProjectName(form.name)}
                visibility={form.visibility}
                branch={form.options.initialBranch}
                onCancel={() => setConfirmOpen(false)}
                onConfirm={() => {
                  setConfirmOpen(false);
                  void creator.execute(false, presetName);
                }}
              />
            )}
            <footer className="action-bar creation-status-bar">
              <button
                type="button"
                className="creation-git-status git-readiness"
                data-ready={!creator.checking && creator.setupReady}
                title="Open setup settings"
                onClick={() => openSettings()}
              >
                <span className="status-dot" aria-hidden="true" />
                <span>
                  {creator.checking
                    ? 'Checking setup…'
                    : creator.setupReady
                      ? 'Git ready'
                      : 'Setup incomplete'}
                </span>
              </button>
              <div className="footer-summary">
                <strong>
                  {creator.previewing
                    ? 'Updating files…'
                    : `${creator.files.length} ${creator.files.length === 1 ? 'file' : 'files'}`}
                </strong>{' '}
                ·{' '}
                {form.destination === 'github'
                  ? `${form.visibility === 'private' ? 'Private' : 'Public'} GitHub repository`
                  : 'On this computer'}
                <button
                  type="button"
                  className="text-button preview-drawer-trigger"
                  aria-expanded={drawerOpen}
                  aria-controls="result-drawer"
                  onClick={() => setDrawerOpen(!drawerOpen)}
                >
                  Preview files ({creator.files.length})
                </button>
              </div>
              <p
                id="creation-reason"
                className={`creation-validation ${summary.text ? 'help' : 'ready-text'}`}
                role="status"
              >
                {summary.text || 'Ready to create'}
                {inlineFix && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => runFix(inlineFix.target)}
                    >
                      {inlineFix.label}
                    </button>
                  </>
                )}
              </p>
              <button
                type="submit"
                ref={createButton}
                className="primary create-button"
                aria-disabled={!creator.ready || undefined}
                aria-describedby="creation-reason"
              >
                {section === 'review' ? 'Create Project' : 'Review project'}
                <Icon name="arrow" size={14} />
              </button>
            </footer>
          </form>
        )}
        {presetsOpen && (
          <PresetDialog
            creator={creator}
            configurationOverride={presetOverride}
            onClose={() => {
              setPresetsOpen(false);
              setPresetOverride(undefined);
            }}
            onSaved={(id) => {
              if (!presetOverride) setPresetId(id);
            }}
            onApply={apply}
          />
        )}
        {handoffOpen && form && preferences && (
          <WorkspaceDialog title="Handoff prompt" onClose={() => setHandoffOpen(false)}>
            <HandoffPanel
              form={form}
              files={creator.files}
              parentPath={preferences.parentPath}
              presetName={presetName}
              copy={creator.copy}
              simple={simple}
            />
          </WorkspaceDialog>
        )}
        {previewPath && form && (
          <GeneratedFilesDialog
            creator={creator}
            initialPath={previewPath}
            onClose={() => setPreviewPath(null)}
          />
        )}
      </div>
    </div>
  );
}

function Subnav({
  base,
  label,
  value,
  items,
  onChange,
}: {
  base: string;
  label: string;
  value: string;
  items: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <TabList
      base={base}
      className="subnavigation"
      label={label}
      value={value}
      items={items.map(([id, name]) => ({ id, label: name }))}
      onChange={onChange}
    />
  );
}
