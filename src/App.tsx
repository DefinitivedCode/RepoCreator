import { useRef, useState } from 'react';
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
import { useCreator } from './useCreator';
import { useUpdates } from './useUpdates';
import { configurationOf, formError } from './validation';
import type { Configuration, Readme } from './types';
import { normalizeProjectName } from './projectName';

export type Section = 'overview' | 'files' | 'agents' | 'review' | 'handoff' | 'recent' | 'setup';
const labels: Record<Section, string> = {
  overview: 'Overview',
  files: 'Project Files',
  agents: 'AI Agents',
  review: 'Review',
  handoff: 'AI Handoff',
  recent: 'Recent Projects',
  setup: 'Setup & status',
};

export default function App() {
  const creator = useCreator();
  const { form, catalog, preferences, state } = creator;
  const updates = useUpdates(preferences);
  const [updateRequest, setUpdateRequest] = useState(0);
  const [section, setSection] = useState<Section>('overview');
  const [page, setPage] = useState<'new' | 'projects' | 'presets' | 'settings'>('new');
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
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
  const blocking =
    (form && formError(form)) ||
    creator.previewError ||
    (!preferences?.parentPath
      ? 'Choose a save location.'
      : !creator.setupReady
        ? 'Complete the required setup.'
        : creator.previewing
          ? 'Updating generated files…'
          : creator.picking
            ? 'Finish the open dialog.'
            : '');
  function navigate(next: Section) {
    if (next === 'setup') {
      setPage('settings');
      return;
    }
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
      setPage('new');
      navigate('overview');
    }
  }
  return (
    <div className="app desktop-app" data-page={page} data-section={section}>
      <header className="app-header">
        <div className="app-title">
          <Icon name="repo" size={19} />
          <h1>Repo Creator</h1>
          {updates.info && <span className="version">{updates.info.currentVersion}</span>}
        </div>
        <nav className="app-navigation" aria-label="Main navigation">
          {(
            [
              ['new', 'New Project', 'file'],
              ['projects', 'Projects', 'folder'],
              ['presets', 'Presets', 'repo'],
              ['settings', 'Settings', 'settings'],
            ] as const
          ).map(([id, name, icon]) => (
            <button
              key={id}
              type="button"
              aria-current={page === id ? 'page' : undefined}
              disabled={creator.busy}
              onClick={() => {
                if (id === 'new' && state.kind !== 'form') {
                  creator.reset();
                  navigate('overview');
                }
                setPage(id);
              }}
            >
              <Icon name={icon} size={15} />
              {name}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          {page === 'new' && (
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
          )}
        </div>
      </header>
      {updates.offer && !updates.dismissed && page !== 'settings' && (
        <aside className="update-notification" aria-label="Software update">
          <span>Repo Creator {updates.offer.version} is available.</span>
          <button
            type="button"
            onClick={() => {
              setUpdateRequest((value) => value + 1);
              setPage('settings');
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
          onSelect={setSelectedProjectId}
          copy={creator.copy}
          commandPresets={allPresets}
          onSaveCommandPreset={(commands: ProjectCommand[]) => {
            setPresetOverride({ ...configurationOf(form), options: { ...form.options, commands } });
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
                    setPage('new');
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
              <p className="help" role="status">
                {creator.checking
                  ? 'Checking setup…'
                  : creator.setupReady
                    ? 'Git ready'
                    : 'Setup required'}
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
            onReturn={() => {
              setPage('new');
              navigate('overview');
            }}
          />
        </main>
      ) : state.kind !== 'form' ? (
        <RepositoryState
          creator={creator}
          presetName={presetName}
          onWorkspace={(id) => {
            setSelectedProjectId(id);
            setPage('projects');
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
                .filter(
                  (s) =>
                    !['recent', 'setup'].includes(s) &&
                    (!simple || !['files', 'agents'].includes(s)),
                )
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
                            : s === 'setup'
                              ? 'settings'
                              : 'folder'
                      }
                      size={15}
                    />
                    {labels[s]}
                  </button>
                ))}
              <button
                type="button"
                className="nav-status"
                onClick={() => {
                  setPage('settings');
                }}
              >
                <span className="status-dot" />
                <span>
                  {creator.checking
                    ? 'Checking setup…'
                    : creator.setupReady
                      ? 'Git ready'
                      : 'Setup required'}
                </span>
              </button>
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
                    {!creator.setupReady && (
                      <button type="button" onClick={() => navigate('setup')}>
                        Complete required setup
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
                {section === 'setup' && (
                  <SetupPanel
                    creator={creator}
                    updates={updates}
                    updateRequest={updateRequest}
                    onReturn={() => navigate('overview')}
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
          <footer className="action-bar">
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
              <span className={blocking ? 'help' : 'ready-text'} role="status">
                {blocking || 'Ready to create'}
              </span>
            </div>
            <button type="submit" className="primary create-button" disabled={!creator.ready}>
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
  );
}

function Subnav({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="subnavigation" role="group" aria-label={label}>
      {items.map(([id, name]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
          {name}
        </button>
      ))}
    </div>
  );
}
