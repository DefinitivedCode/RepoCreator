import { useReducer, useRef, useState } from 'react';
import { Icon } from './icons';
import { AdvancedPanel, FilePreview, IgnorePanel, type FileSection } from './ConfigurationPanels';
import { PresetDialog } from './PresetDialog';
import { FocusedFilePreview } from './FocusedFilePreview';
import { GeneratedFilesDialog } from './GeneratedFilesDialog';
import { AgentStudio, type AgentSection } from './AgentStudio';
import { HandoffPanel } from './HandoffPanel';
import { Projects } from './ProjectWorkspace';
import type { ProjectCommand } from './workspaceTypes';
import { technologySummary } from './technologies';
import { RepositoryState } from './RepositoryState';
import { Overview, ProjectSummary, SetupPanel, Context } from './WorkspaceFields';
import { Sidebar } from './shell/Sidebar';
import { initialRoute, routeReducer, type SettingsTarget } from './shell/route';
import { TabList, panelIdOf, tabId } from './ui/Tabs';
import './shell/shell.css';
import { useCreator } from './useCreator';
import { useUpdates } from './useUpdates';
import { configurationOf } from './validation';
import { isSetupBlocker, summarizeBlockers, type FixTarget } from './blockers';
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
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ configuration: Configuration; id: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
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
            onSaveCommandPreset={(commands: ProjectCommand[]) => {
              setPresetOverride({
                ...configurationOf(form),
                options: { ...form.options, commands },
              });
              setPresetsOpen(true);
            }}
          />
        ) : page === 'presets' ? (
          <main className="library-page" aria-label="Project presets">
            <div className="page-heading">
              <div>
                <p className="eyebrow">REUSABLE STARTING POINTS</p>
                <h2>Presets</h2>
                <p className="help">
                  Keep your preferred files, technologies, assistants and commands together.
                </p>
              </div>
              <button type="button" className="primary" onClick={() => setPresetsOpen(true)}>
                Manage presets
              </button>
            </div>
            <div className="preset-library">
              {allPresets.map((item) => (
                <article key={item.id} className="workspace-card preset-card">
                  <span className="eyebrow">
                    {item.id.startsWith('custom-') ? 'CUSTOM' : 'BUILT-IN'}
                  </span>
                  <h3>{item.name}</h3>
                  <p className="help">{item.description || 'A reusable project configuration.'}</p>
                  <p className="preset-details">
                    {technologySummary(
                      item.configuration.options.technologies ?? { ids: [], custom: [] },
                    )}
                    <span>
                      {item.configuration.options.commands?.length ?? 0} commands ·{' '}
                      {item.configuration.options.ai.enabled
                        ? item.configuration.options.ai.agents.length
                        : 0}{' '}
                      assistants
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      apply(item.configuration, item.id);
                      navigateTo({ type: 'go', page: 'new' });
                      navigate('overview');
                    }}
                  >
                    Use preset <Icon name="arrow" size={14} />
                  </button>
                </article>
              ))}
            </div>
          </main>
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
              if (section !== 'review') navigate('review');
              else void creator.execute(false, presetName);
            }}
          >
            <div className={`workspace ${showContext ? 'with-context' : ''}`}>
              <nav className="navigation-rail" aria-label="Project setup">
                <span className="nav-caption">PROJECT SETUP</span>
                {(Object.keys(labels) as Section[])
                  .filter((s) => !simple || !['files', 'agents'].includes(s))
                  .map((s) => (
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
                  <div className="segmented mode-switch" role="group" aria-label="Experience mode">
                    <button
                      type="button"
                      aria-pressed={simple}
                      disabled={creator.busy}
                      onClick={() => {
                        void creator.experienceMode('simple');
                        if (section === 'files' || section === 'agents') navigate('overview');
                      }}
                    >
                      Simple
                    </button>
                    <button
                      type="button"
                      aria-pressed={!simple}
                      disabled={creator.busy}
                      onClick={() => void creator.experienceMode('advanced')}
                    >
                      Advanced
                    </button>
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
                  />
                </aside>
              )}
            </div>
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
                className="primary create-button"
                disabled={!creator.ready}
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
