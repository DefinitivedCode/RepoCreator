import { useRef, useState } from 'react';
import { Icon } from './icons';
import { AdvancedPanel, FilePreview, IgnorePanel, type FileSection } from './ConfigurationPanels';
import { PresetDialog } from './PresetDialog';
import { AgentStudio, type AgentSection } from './AgentStudio';
import { HandoffPanel, RecentProjects } from './HandoffPanel';
import { RepositoryState } from './RepositoryState';
import { Overview, ProjectSummary, SetupPanel, Context } from './WorkspaceFields';
import { useCreator } from './useCreator';
import { configurationOf, formError } from './validation';
import type { Appearance, Configuration, Readme } from './types';

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
  const [section, setSection] = useState<Section>('overview');
  const [fileSection, setFileSection] = useState<FileSection | 'ignore'>('readme');
  const [agentSection, setAgentSection] = useState<AgentSection>('assistants');
  const [presetId, setPresetId] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [undo, setUndo] = useState<{ configuration: Configuration; id: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const simple = preferences?.experienceMode !== 'advanced';
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
    setSection(next);
    requestAnimationFrame(() => {
      heading.current?.focus();
      document.querySelector('.workspace-main')?.scrollTo(0, 0);
    });
  }
  function apply(configuration: Configuration, id: string) {
    if (form) setUndo({ configuration: structuredClone(configurationOf(form)), id: presetId });
    creator.configure(configuration);
    setPresetId(id);
  }
  return (
    <div className="app desktop-app">
      <header className="app-header">
        <div className="app-title">
          <Icon name="repo" size={19} />
          <h1>Repo Creator</h1>
          <span className="version">1.3</span>
        </div>
        <div className="header-actions">
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
          <label className="appearance-control">
            <span className="sr-only">Appearance</span>
            <select
              value={preferences?.appearance ?? 'system'}
              disabled={!preferences || creator.busy}
              onChange={(e) => void creator.appearance(e.target.value as Appearance)}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </header>
      {!form || !catalog || !preferences ? (
        <main className="content">
          <p role="status">{creator.notice || creator.error?.message || 'Loading settings…'}</p>
        </main>
      ) : state.kind !== 'form' ? (
        <RepositoryState
          creator={creator}
          presetName={presetName}
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
          <div className={`workspace ${contextOpen ? 'with-context' : ''}`}>
            <nav className="navigation-rail" aria-label="Project setup">
              <span className="nav-caption">NEW PROJECT</span>
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
                            : s === 'setup'
                              ? 'settings'
                              : 'folder'
                      }
                      size={15}
                    />
                    {labels[s]}
                  </button>
                ))}
              <div className="nav-status">
                <span className="status-dot" />
                <span>
                  {creator.checking
                    ? 'Checking setup…'
                    : creator.setupReady
                      ? 'Git ready'
                      : 'Setup required'}
                </span>
              </div>
              <p className="help nav-note">
                {simple
                  ? 'Start with the essentials. Advanced keeps all your settings.'
                  : 'Files and instructions are generated locally.'}
              </p>
            </nav>
            <main className="workspace-main" aria-label="Repository configuration" tabIndex={0}>
              <div className="workspace-heading">
                <div>
                  <p className="eyebrow">{simple ? 'SIMPLE SETUP' : 'PROJECT WORKSPACE'}</p>
                  <h2 ref={heading} tabIndex={-1}>
                    {labels[section]}
                  </h2>
                </div>
                <button
                  type="button"
                  className="text-button context-toggle"
                  aria-pressed={contextOpen}
                  onClick={() => setContextOpen(!contextOpen)}
                >
                  {contextOpen ? 'Hide details' : 'Show details'}
                </button>
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
                    />
                    {undo && (
                      <p className="notice">
                        Starting point applied.{' '}
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            creator.configure(undo.configuration);
                            setPresetId(undo.id);
                            setUndo(null);
                          }}
                        >
                          Undo preset change
                        </button>
                      </p>
                    )}
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
                    <AgentStudio creator={creator} section={agentSection} />
                  </>
                )}
                {section === 'review' && (
                  <>
                    <p className="section-intro">
                      Check the destination and generated files. Creating a project makes a new
                      folder and its first Git commit.
                    </p>
                    <ProjectSummary creator={creator} presetName={presetName} />
                    <FilePreview
                      name={form.name || 'project-name'}
                      files={creator.files}
                      loading={creator.previewing}
                      error={creator.previewError}
                      expanded
                    />
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
                {section === 'recent' && <RecentProjects copy={creator.copy} />}
                {section === 'setup' && (
                  <SetupPanel creator={creator} onReturn={() => navigate('overview')} />
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
            {contextOpen && (
              <aside className="context-panel" aria-label="Project context">
                <Context creator={creator} section={section} presetName={presetName} />
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
          onClose={() => setPresetsOpen(false)}
          onSaved={setPresetId}
          onApply={apply}
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
