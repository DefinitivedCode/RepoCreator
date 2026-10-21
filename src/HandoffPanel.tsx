import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { appError } from './validation';
import type { CreatedRepo, GeneratedFile, RepositoryForm } from './types';
import {
  builtInTemplates,
  contextForProject,
  exportTemplate,
  loadHandoffSettings,
  parseTemplate,
  promptStyles,
  promptVariables,
  renderPrompt,
  saveHandoffSettings,
  templateError,
  type HandoffContext,
  type HandoffStyle,
  type PromptTemplate,
} from './handoff';

// Navigation drafts live only in this process. Prompt bodies are never written to
// browser storage or native history, and closing the application clears them.
const navigationDrafts = new Map<string, { templateId: string; prompt: string; source: string }>();

export function HandoffPanel({
  form,
  files,
  parentPath,
  presetName,
  result,
  copy,
  onTemplateChange,
}: {
  form: RepositoryForm;
  files: GeneratedFile[];
  parentPath: string;
  presetName: string;
  result?: CreatedRepo;
  simple?: boolean;
  copy: (text: string) => Promise<void>;
  onTemplateChange?: (id: string) => void;
}) {
  const context = useMemo(
    () => contextForProject(form, files, parentPath, presetName, result),
    [form, files, parentPath, presetName, result],
  );
  return (
    <PromptWorkspace
      context={context}
      recommendedTemplate={form.handoffTemplate}
      copy={copy}
      onTemplateChange={onTemplateChange}
    />
  );
}

function PromptWorkspace({
  context,
  recommendedTemplate,
  copy,
  onTemplateChange,
}: {
  context: HandoffContext;
  recommendedTemplate?: string;
  copy: (text: string) => Promise<void>;
  onTemplateChange?: (id: string) => void;
}) {
  const [settings, setSettings] = useState(loadHandoffSettings);
  const draftKey = `${context.status}:${context.localPath}:${context.projectName}`;
  const [initialDraft] = useState(() => navigationDrafts.get(draftKey));
  const [templateId, setTemplateId] = useState(
    initialDraft?.templateId || recommendedTemplate || 'discovery',
  );
  const [missingRecommendation, setMissingRecommendation] = useState(() => {
    const requested = initialDraft?.templateId || recommendedTemplate;
    return requested &&
      ![...builtInTemplates, ...settings.templates].some((template) => template.id === requested)
      ? requested
      : '';
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [imported, setImported] = useState<PromptTemplate | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const templates = [...builtInTemplates, ...settings.templates];
  const selected = templates.find((template) => template.id === templateId) ?? builtInTemplates[0];
  const rendered = useMemo(
    () => renderPrompt(selected, context, settings.style),
    [selected.body, context, settings.style],
  );
  const [prompt, setPrompt] = useState(initialDraft?.prompt ?? rendered);
  const [source, setSource] = useState(initialDraft?.source ?? rendered);
  const changedContext = source !== rendered;
  const edited = prompt !== source;
  useEffect(() => {
    setTemplateName(selected.name);
    setTemplateBody(selected.body);
  }, [selected.id, selected.name, selected.body]);
  useEffect(() => {
    navigationDrafts.delete(draftKey);
    navigationDrafts.set(draftKey, { templateId: selected.id, prompt, source });
    if (navigationDrafts.size > 10) navigationDrafts.delete(navigationDrafts.keys().next().value!);
  }, [draftKey, selected.id, prompt, source]);

  function persist(next: typeof settings) {
    try {
      saveHandoffSettings(next);
      setSettings(next);
      setError('');
      return true;
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not save local prompt settings.');
      return false;
    }
  }
  function regenerate() {
    setPrompt(rendered);
    setSource(rendered);
    setMessage('Prompt regenerated from the current project.');
  }
  function chooseTemplate(id: string) {
    const template = templates.find((item) => item.id === id) ?? builtInTemplates[0];
    const next = renderPrompt(template, context, settings.style);
    setTemplateId(template.id);
    onTemplateChange?.(template.id);
    setPrompt(next);
    setSource(next);
    setMessage('');
    setError('');
    setMissingRecommendation('');
  }
  function changeStyle(style: HandoffStyle) {
    if (!persist({ ...settings, style })) return;
    const next = renderPrompt(selected, context, style);
    setPrompt(next);
    setSource(next);
  }
  function saveTemplate(duplicate: boolean) {
    const name = templateName.trim();
    const validation = templateError(templateBody);
    if (validation || !name || name.length > 60 || /[\x00-\x1f\x7f]/.test(name)) {
      setError(validation || 'Use a template name of 1–60 printable characters.');
      return;
    }
    const updating = !duplicate && selected.id.startsWith('custom-');
    if (
      settings.templates.some(
        (item) =>
          item.name.toLowerCase() === name.toLowerCase() && (!updating || item.id !== selected.id),
      )
    ) {
      setError('A saved template already uses this name. Choose a different name.');
      return;
    }
    const template = {
      id: updating ? selected.id : `custom-${crypto.randomUUID()}`,
      name,
      body: templateBody,
    };
    const next = updating
      ? settings.templates.map((item) => (item.id === template.id ? template : item))
      : [...settings.templates, template];
    if (persist({ ...settings, templates: next })) {
      setTemplateId(template.id);
      onTemplateChange?.(template.id);
      const text = renderPrompt(template, context, settings.style);
      setPrompt(text);
      setSource(text);
      setMessage('Custom template saved on this device.');
    }
  }
  async function nativeSave(content: string, kind: 'markdown' | 'text' | 'template') {
    setPending(true);
    setError('');
    try {
      const saved = await invoke<boolean>('export_handoff_text', { content, kind });
      if (saved) setMessage('Saved to the selected file.');
    } catch (value) {
      setError(appError(value).message);
    } finally {
      setPending(false);
    }
  }
  async function importTemplate() {
    setPending(true);
    setError('');
    try {
      const text = await invoke<string | null>('import_handoff_template');
      if (text !== null) setImported(parseTemplate(text));
    } catch (value) {
      setError(value instanceof Error ? value.message : appError(value).message);
    } finally {
      setPending(false);
    }
  }
  function confirmImport() {
    if (!imported) return;
    if (
      settings.templates.some((item) => item.name.toLowerCase() === imported.name.toLowerCase())
    ) {
      setError('A saved template already uses this name. Rename the import before adding it.');
      return;
    }
    if (persist({ ...settings, templates: [...settings.templates, imported] })) {
      setTemplateId(imported.id);
      onTemplateChange?.(imported.id);
      const text = renderPrompt(imported, context, settings.style);
      setPrompt(text);
      setSource(text);
      setImported(null);
      setMessage('Template imported.');
    }
  }
  return (
    <section className="handoff-panel" aria-labelledby="handoff-heading">
      <div className="section-heading">
        <div>
          <h2 id="handoff-heading">Plan with AI</h2>
          <p className="help">
            Create a prompt locally, review it, then paste it into your preferred chatbot. No
            project information is sent automatically.
          </p>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="handoff-template">Prompt template</label>
          <select
            id="handoff-template"
            value={selected.id}
            onChange={(event) => chooseTemplate(event.target.value)}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="handoff-style">Prompt style</label>
          <select
            id="handoff-style"
            value={settings.style}
            onChange={(event) => changeStyle(event.target.value as HandoffStyle)}
          >
            {promptStyles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {missingRecommendation && (
        <p className="notice" role="status">
          Recommended template “{missingRecommendation}” is unavailable on this computer. Project
          Discovery is selected. Import the missing custom template or choose another template.
        </p>
      )}
      <p className="help">
        {context.status === 'created'
          ? 'Uses the confirmed creation result.'
          : 'This is a planning prompt. Project creation has not been confirmed.'}{' '}
        Review local paths and any sensitive information before sharing.
      </p>
      <p className="help">
        Choosing a template or style regenerates the prompt and replaces prompt edits. Navigation
        keeps your current draft until the app closes.
      </p>
      {changedContext && (
        <p role="status" className="notice">
          Project settings changed. Regenerate the prompt to include them; your current edits have
          been kept.
        </p>
      )}
      <div className="field">
        <label htmlFor="handoff-prompt">AI prompt{edited ? ' · edited' : ''}</label>
        <textarea
          id="handoff-prompt"
          className="handoff-preview"
          rows={16}
          value={prompt}
          maxLength={128 * 1024}
          spellCheck={false}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </div>
      <div className="inline-actions handoff-actions">
        <button
          type="button"
          className="primary"
          disabled={!prompt.trim()}
          onClick={() => void copy(prompt)}
        >
          Copy AI Prompt
        </button>
        <button type="button" onClick={regenerate}>
          Regenerate
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void nativeSave(prompt, 'markdown')}
        >
          Save Markdown
        </button>
        <button type="button" disabled={pending} onClick={() => void nativeSave(prompt, 'text')}>
          Save Text
        </button>
        <button type="button" aria-expanded={editorOpen} onClick={() => setEditorOpen(!editorOpen)}>
          Custom templates
        </button>
      </div>
      {editorOpen && (
        <div className="template-editor">
          <h3>Reusable prompt templates</h3>
          <p className="help">
            Built-in templates can be duplicated. Custom templates stay on this device until
            exported.
          </p>
          <div className="field">
            <label htmlFor="template-name">Template name</label>
            <input
              id="template-name"
              maxLength={60}
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="template-body">Template text</label>
            <textarea
              id="template-body"
              rows={10}
              maxLength={65536}
              value={templateBody}
              onChange={(event) => setTemplateBody(event.target.value)}
            />
          </div>
          <p className="help">
            Supported variables: {promptVariables.map((variable) => `{{${variable}}}`).join(', ')}
          </p>
          <div className="inline-actions">
            <button type="button" onClick={() => saveTemplate(false)}>
              {selected.id.startsWith('custom-') ? 'Save changes' : 'Save as custom'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTemplateName(`${selected.name.slice(0, 50)} copy`);
                setMessage('Name the copy, then select Save as duplicate.');
              }}
            >
              Duplicate template
            </button>
            <button type="button" onClick={() => saveTemplate(true)}>
              Save as duplicate
            </button>
            <button
              type="button"
              onClick={() => {
                setTemplateBody(
                  builtInTemplates.find((item) => item.id === selected.id)?.body ?? selected.body,
                );
                setMessage('Template text reset. Save changes to keep it.');
              }}
            >
              Reset template text
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                void nativeSave(
                  exportTemplate({ ...selected, name: templateName, body: templateBody }),
                  'template',
                )
              }
            >
              Export template
            </button>
            <button type="button" disabled={pending} onClick={() => void importTemplate()}>
              Import template
            </button>
            {selected.id.startsWith('custom-') && (
              <button
                type="button"
                onClick={() => {
                  if (
                    persist({
                      ...settings,
                      templates: settings.templates.filter((item) => item.id !== selected.id),
                    })
                  )
                    chooseTemplate('discovery');
                }}
              >
                Delete custom template
              </button>
            )}
          </div>
          {imported && (
            <section className="import-preview" aria-label="Prompt template import preview">
              <h3>Review imported template</h3>
              <div className="field">
                <label htmlFor="import-template-name">Name</label>
                <input
                  id="import-template-name"
                  maxLength={60}
                  value={imported.name}
                  onChange={(event) => setImported({ ...imported, name: event.target.value })}
                />
              </div>
              <pre className="preview">{imported.body}</pre>
              <p className="help">
                This adds one text template. No commands, downloads or global settings are applied.
              </p>
              <div className="inline-actions">
                <button type="button" onClick={confirmImport}>
                  Add imported template
                </button>
                <button type="button" onClick={() => setImported(null)}>
                  Cancel import
                </button>
              </div>
            </section>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="help">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  );
}

interface RecentProject {
  id: string;
  createdAt: number;
  context: HandoffContext;
  handoffTemplate?: string;
}
export function RecentProjects({ copy }: { copy: (text: string) => Promise<void> }) {
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [selected, setSelected] = useState<RecentProject | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void invoke<RecentProject[]>('list_recent_projects')
      .then((items) => setProjects(Array.isArray(items) ? items : []))
      .catch((value) => setError(appError(value).message));
  }, []);
  async function open(project: RecentProject, target: 'folder' | 'github') {
    try {
      await invoke('open_recent_project', { id: project.id, target });
      setError('');
    } catch (value) {
      setError(appError(value).message);
    }
  }
  async function remove(project: RecentProject) {
    try {
      setProjects(await invoke<RecentProject[]>('remove_recent_project', { id: project.id }));
      if (selected?.id === project.id) setSelected(null);
      setError('');
    } catch (value) {
      setError(appError(value).message);
    }
  }
  return (
    <section aria-labelledby="recent-heading" className="recent-projects">
      <h2 id="recent-heading">Recent projects</h2>
      <p className="help">
        Creation metadata stays on this computer. Removing an entry keeps its project files.
      </p>
      {!projects.length && !error && <p className="help">Projects you create will appear here.</p>}
      {projects.map((project) => (
        <article key={project.id} className="recent-project">
          <h3>{project.context.projectName}</h3>
          <p className="path">{project.context.localPath}</p>
          <p className="help">
            {new Date(project.createdAt * 1000).toLocaleDateString()} ·{' '}
            {project.context.presetName || 'No preset'} ·{' '}
            {project.context.agents.join(', ') || 'No assistant'}
          </p>
          <div className="inline-actions">
            <button type="button" onClick={() => void open(project, 'folder')}>
              Open Folder
            </button>
            {project.context.repositoryUrl && (
              <button type="button" onClick={() => void open(project, 'github')}>
                Open on GitHub
              </button>
            )}
            <button type="button" onClick={() => setSelected(project)}>
              Plan with AI
            </button>
            <button type="button" onClick={() => void remove(project)}>
              Remove from history
            </button>
          </div>
        </article>
      ))}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {selected && (
        <div className="recent-handoff">
          <button type="button" onClick={() => setSelected(null)}>
            Close previous project prompt
          </button>
          <PromptWorkspace
            key={selected.id}
            context={selected.context}
            recommendedTemplate={selected.handoffTemplate}
            copy={copy}
          />
        </div>
      )}
    </section>
  );
}
