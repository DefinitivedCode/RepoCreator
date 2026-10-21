import { useState } from 'react';
import { Icon } from './icons';
import { appError } from './validation';
import type { Creator } from './useCreator';
import type { AIStudio, InstructionProfile, SavedInstructions, Workflow } from './aiTypes';
import { SpecialistEditor } from './SpecialistEditor';
import { StudioAdvanced } from './StudioAdvanced';

export function AgentStudio({ creator }: { creator: Creator }) {
  const [search, setSearch] = useState('');
  const [presetName, setPresetName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [imported, setImported] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { form, catalog, preferences } = creator;
  if (!form || !catalog?.studio || !preferences) return null;
  const studio = form.options.ai;
  const source = catalog.studio;
  const profile = studio.instructions;
  const update = (next: AIStudio) => creator.update('options', { ...form.options, ai: next });
  const setProfile = (next: InstructionProfile) => update({ ...studio, instructions: next });
  const savedPresets = preferences.instructionPresets ?? [];
  const selectedSaved = savedPresets.find((p) => p.id === profile.preset);
  const selectedBuiltIn = source.presets.find((p) => p.id === profile.preset);
  const selectedId = selectedSaved?.id ?? selectedBuiltIn?.id ?? 'custom';
  const shared = creator.files.find((file) => file.path === 'AGENTS.md');
  function load(id: string, rulesOnly = false) {
    const saved = savedPresets.find((preset) => preset.id === id);
    const builtIn = source.presets.find((preset) => preset.id === id);
    if (saved && !rulesOnly) setProfile({ ...structuredClone(saved.profile), preset: id });
    else if (saved || builtIn) {
      const preset = saved?.profile ?? builtIn!;
      setProfile({
        ...profile,
        preset: id,
        workflow: preset.workflow,
        rules: [...preset.rules],
        wording: saved ? { ...saved.profile.wording } : {},
      });
    }
    setDeleting(false);
  }
  async function saveInstructions() {
    setError('');
    setMessage('');
    try {
      const result = await creator.studioAction<{ instructionPresets: SavedInstructions[] }>(
        'save_instruction_preset',
        { name: presetName, profile },
      );
      const saved = result.instructionPresets.at(-1);
      if (saved) setProfile({ ...profile, preset: saved.id });
      setMessage('Instruction preset saved.');
      setPresetName('');
    } catch (value) {
      setError(appError(value).message);
    }
  }
  async function exportInstructions() {
    setError('');
    setMessage('');
    try {
      const saved = await creator.studioAction<boolean>('export_instruction_preset', {
        name: presetName || selectedSaved?.name || selectedBuiltIn?.name || 'Custom',
        profile,
      });
      if (saved) setMessage('Instruction preset exported.');
    } catch (value) {
      setError(appError(value).message);
    }
  }
  async function importPreset() {
    setError('');
    setMessage('');
    try {
      const result = await creator.studioAction<{ instructionPresets: SavedInstructions[] } | null>(
        'import_instruction_preset',
      );
      const saved = result?.instructionPresets.at(-1);
      if (saved) {
        setProfile({ ...saved.profile, preset: saved.id });
        setMessage('Instruction preset imported and loaded.');
      }
    } catch (value) {
      setError(appError(value).message);
    }
  }
  async function importMarkdown() {
    setError('');
    setMessage('');
    try {
      const text = await creator.studioAction<string | null>('import_instructions');
      if (text === null) return;
      if (profile.customText) setImported(text);
      else setProfile({ ...profile, customText: text });
    } catch (value) {
      setError(appError(value).message);
    }
  }
  function applyImport(append: boolean) {
    const text = append
      ? `${profile.customText}${profile.customText.endsWith('\n') ? '\n' : '\n\n'}${imported}`
      : imported!;
    if (new TextEncoder().encode(text).length > 65_536) {
      setError('Combined instructions exceed 64 KiB. Shorten the text before importing.');
      return;
    }
    setProfile({ ...profile, customText: text });
    setImported(null);
  }
  async function deletePreset() {
    setError('');
    try {
      await creator.studioAction('delete_instruction_preset', { id: selectedSaved?.id });
      setProfile({ ...profile, preset: 'custom' });
      setDeleting(false);
      setMessage('Saved preset deleted; current instructions were kept.');
    } catch (value) {
      setError(appError(value).message);
    }
  }
  return (
    <details className="disclosure agent-panel">
      <summary>
        <Icon name="code" size={15} />
        <span>AI Agents</span>
        <span className="summary-meta">
          {studio.enabled ? `${studio.agents.length} selected` : 'Off'}
        </span>
        <Icon name="chevron" size={14} />
      </summary>
      <div className="disclosure-body">
        <label className="check-label">
          <input
            type="checkbox"
            checked={studio.enabled}
            onChange={(event) =>
              update({
                ...studio,
                enabled: event.target.checked,
                agents: event.target.checked && !studio.agents.length ? ['codex'] : studio.agents,
              })
            }
          />
          Generate AI agent files
        </label>
        {!studio.enabled ? (
          <p className="help">No AI instructions or configuration files will be generated.</p>
        ) : (
          <>
            <section className="settings-section">
              <h3>Coding agents</h3>
              <div className="checkbox-grid">
                {source.agents.map((agent) => (
                  <label className="check-label" key={agent.id} title={agent.description}>
                    <input
                      type="checkbox"
                      checked={studio.agents.includes(agent.id)}
                      onChange={() =>
                        update({
                          ...studio,
                          agents: studio.agents.includes(agent.id)
                            ? studio.agents.filter((id) => id !== agent.id)
                            : [...studio.agents, agent.id],
                        })
                      }
                    />
                    {agent.name}
                  </label>
                ))}
              </div>
              {!studio.agents.length && (
                <p className="inline-error">
                  Select at least one coding agent, or turn off AI files.
                </p>
              )}
            </section>
            <section className="settings-section">
              <div className="field">
                <label htmlFor="instruction-preset">Instruction preset</label>
                <select
                  id="instruction-preset"
                  value={selectedId}
                  onChange={(event) => load(event.target.value)}
                >
                  <optgroup label="Built-in">
                    {source.presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </optgroup>
                  {!!savedPresets.length && (
                    <optgroup label="Saved instructions">
                      {savedPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="help">
                  {selectedBuiltIn?.description ?? 'Your saved, editable development instructions.'}
                </p>
              </div>
              <div className="inline-actions studio-actions">
                <button type="button" onClick={() => load(selectedId, true)}>
                  Reset preset rules
                </button>
                <button type="button" onClick={() => void importPreset()}>
                  Import preset…
                </button>
                <button type="button" onClick={() => void exportInstructions()}>
                  Export preset…
                </button>
                {selectedSaved && (
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => setDeleting(true)}
                  >
                    Delete saved preset
                  </button>
                )}
              </div>
              {deleting && (
                <div className="delete-confirm">
                  <p>Delete “{selectedSaved?.name}”? Current instructions will be kept.</p>
                  <div className="inline-actions">
                    <button type="button" className="danger" onClick={() => void deletePreset()}>
                      Delete instruction preset
                    </button>
                    <button type="button" onClick={() => setDeleting(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <details className="studio-subsection">
                <summary>
                  Development rules <span className="help">{profile.rules.length} enabled</span>
                </summary>
                <div className="studio-section-body">
                  <label className="field">
                    <span className="control-label">Find development rules</span>
                    <input
                      type="search"
                      value={search}
                      placeholder="Search rules…"
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  {[...new Set(source.rules.map((rule) => rule.group))].map((group) => {
                    const rules = source.rules.filter(
                      (rule) =>
                        rule.group === group &&
                        `${rule.label} ${rule.text}`.toLowerCase().includes(search.toLowerCase()),
                    );
                    return rules.length ? (
                      <section className="studio-rule-group" key={group}>
                        <h3>{group}</h3>
                        <div className="checkbox-grid">
                          {rules.map((rule) => (
                            <label
                              className="check-label"
                              key={rule.id}
                              title={profile.wording[rule.id] ?? rule.text}
                            >
                              <input
                                type="checkbox"
                                checked={profile.rules.includes(rule.id)}
                                onChange={() =>
                                  setProfile({
                                    ...profile,
                                    rules: profile.rules.includes(rule.id)
                                      ? profile.rules.filter((id) => id !== rule.id)
                                      : [...profile.rules, rule.id],
                                  })
                                }
                              />
                              {rule.label}
                            </label>
                          ))}
                        </div>
                      </section>
                    ) : null;
                  })}
                  <label className="field">
                    <span className="control-label">Working approach</span>
                    <select
                      value={profile.workflow}
                      onChange={(event) =>
                        setProfile({ ...profile, workflow: event.target.value as Workflow })
                      }
                    >
                      <option value="balanced">Balanced</option>
                      <option value="autonomous">Autonomous within the requested scope</option>
                      <option value="review-first">Review and propose an approach first</option>
                    </select>
                  </label>
                </div>
              </details>
              <details className="studio-subsection">
                <summary>
                  Technology guidance{' '}
                  <span className="help">{profile.technologies.length} selected</span>
                </summary>
                <div className="studio-section-body">
                  <p className="help">
                    Suggestions from the project preset. These describe intended technologies, not
                    an existing scaffold.
                  </p>
                  <div className="checkbox-grid">
                    {source.technologies.map((technology) => (
                      <label
                        className="check-label"
                        key={technology.id}
                        title={profile.technologyWording[technology.id] ?? technology.instructions}
                      >
                        <input
                          type="checkbox"
                          checked={profile.technologies.includes(technology.id)}
                          onChange={() =>
                            setProfile({
                              ...profile,
                              technologies: profile.technologies.includes(technology.id)
                                ? profile.technologies.filter((id) => id !== technology.id)
                                : [...profile.technologies, technology.id],
                            })
                          }
                        />
                        {technology.name}
                      </label>
                    ))}
                  </div>
                </div>
              </details>
            </section>
            <section className="settings-section">
              <div className="field">
                <label htmlFor="custom-instructions">
                  Additional project instructions <span className="optional">user-authored</span>
                </label>
                <textarea
                  id="custom-instructions"
                  className="mono"
                  rows={5}
                  maxLength={65_536}
                  value={profile.customText}
                  onChange={(event) => setProfile({ ...profile, customText: event.target.value })}
                  placeholder="Your own Markdown instructions…"
                />
              </div>
              <div className="inline-actions studio-actions">
                <button type="button" onClick={() => void importMarkdown()}>
                  Import Markdown…
                </button>
                <span className="help">UTF-8 · up to 64 KiB</span>
              </div>
              {imported !== null && (
                <div className="delete-confirm">
                  <p>
                    Instructions already contain text. Append the imported Markdown or replace the
                    current text?
                  </p>
                  <div className="inline-actions studio-actions">
                    <button type="button" onClick={() => applyImport(true)}>
                      Append imported text
                    </button>
                    <button type="button" onClick={() => applyImport(false)}>
                      Replace current text
                    </button>
                    <button type="button" onClick={() => setImported(null)}>
                      Cancel import
                    </button>
                  </div>
                </div>
              )}
              <div className="field">
                <label htmlFor="save-instructions-name">Save instructions as</label>
                <div className="inline-actions">
                  <input
                    id="save-instructions-name"
                    maxLength={60}
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="e.g. My development rules"
                  />
                  <button
                    type="button"
                    disabled={!presetName.trim()}
                    onClick={() => void saveInstructions()}
                  >
                    Save instructions
                  </button>
                </div>
              </div>
              <details className="studio-subsection">
                <summary>Shared Markdown preview</summary>
                <div className="studio-section-body">
                  {creator.previewing ? (
                    <p className="help">Updating preview…</p>
                  ) : shared ? (
                    <pre className="preview" tabIndex={0} aria-label="Shared instructions preview">
                      {shared.content}
                    </pre>
                  ) : (
                    <p className="help">
                      Complete the configuration to preview shared instructions.
                    </p>
                  )}
                </div>
              </details>
            </section>
            <SpecialistEditor studio={studio} update={update} creator={creator} />
            <details className="studio-subsection">
              <summary>
                Agent skills <span className="help">optional</span>
              </summary>
              <div className="studio-section-body">
                <p className="help">
                  One shared .agents/skills directory, currently generated for Codex and OpenCode.
                  Skills are task workflows, not always-on rules.
                </p>
                <div className="checkbox-grid">
                  {source.skills.map((skill) => (
                    <label className="check-label" key={skill.id} title={skill.description}>
                      <input
                        type="checkbox"
                        checked={studio.skills.includes(skill.id)}
                        onChange={() =>
                          update({
                            ...studio,
                            skills: studio.skills.includes(skill.id)
                              ? studio.skills.filter((id) => id !== skill.id)
                              : [...studio.skills, skill.id],
                          })
                        }
                      />
                      {skill.name}
                    </label>
                  ))}
                </div>
                {!studio.agents.some((agent) => ['codex', 'opencode'].includes(agent)) &&
                  !!studio.skills.length && (
                    <p className="help">Select Codex or OpenCode to generate these skills.</p>
                  )}
              </div>
            </details>
            <StudioAdvanced studio={studio} update={update} source={source} />
            <p className="help">
              All generated AI files appear in File preview below. Instructions are saved as data
              and are never executed by Repo Creator.
            </p>
            {creator.previewError && (
              <p className="inline-error" role="status">
                {creator.previewError}
              </p>
            )}
          </>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="help" role="status">
            {message}
          </p>
        )}
      </div>
    </details>
  );
}
