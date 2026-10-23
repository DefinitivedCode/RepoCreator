import { useState } from 'react';
import type { AIStudio, ScopedRule, StudioCatalog } from './aiTypes';

const emptyRule = (): ScopedRule => ({
  id: '',
  name: '',
  patterns: [],
  content: '',
  mode: 'files',
});

export function StudioAdvanced({
  studio,
  update,
  source,
}: {
  studio: AIStudio;
  update: (next: AIStudio) => void;
  source: StudioCatalog;
}) {
  const [ruleId, setRuleId] = useState(source.rules[0].id);
  const [technologyId, setTechnologyId] = useState(source.technologies[0].id);
  const [draft, setDraft] = useState<ScopedRule>(emptyRule);
  const [patterns, setPatterns] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const profile = studio.instructions;
  const rule = source.rules.find((r) => r.id === ruleId)!;
  const technology = source.technologies.find((t) => t.id === technologyId)!;
  const setOptional = (next: Partial<AIStudio['optionalConfig']>) =>
    update({ ...studio, optionalConfig: { ...studio.optionalConfig, ...next } });
  function saveRule() {
    if (studio.scopedRules.some((r) => r.id === draft.id && r.id !== editingId)) {
      setError('A scoped rule with that ID already exists.');
      return;
    }
    const next = {
      ...draft,
      patterns:
        draft.mode === 'files'
          ? patterns
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)
          : [],
    };
    update({
      ...studio,
      scopedRules: editingId
        ? studio.scopedRules.map((r) => (r.id === editingId ? next : r))
        : [...studio.scopedRules, next],
    });
    setDraft(emptyRule());
    setPatterns('');
    setEditingId(null);
    setError('');
  }
  return (
    <details className="studio-subsection studio-advanced">
      <summary>Advanced AI configuration</summary>
      <div className="studio-section-body advanced-configuration-grid">
        <section className="settings-section">
          <h3>
            Project context <span className="help">optional, user-authored</span>
          </h3>
          {(
            [
              ['stack', 'Intended stack'],
              ['architecture', 'Architecture expectations'],
              ['conventions', 'Coding conventions'],
              ['verification', 'Known verification guidance'],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={`ai-${key}`}>{label}</label>
              <textarea
                id={`ai-${key}`}
                rows={2}
                maxLength={4096}
                value={profile[key]}
                onChange={(event) =>
                  update({ ...studio, instructions: { ...profile, [key]: event.target.value } })
                }
              />
            </div>
          ))}
          <p className="help">
            Only include facts you know. Repo Creator does not invent project structure or build
            commands.
          </p>
        </section>
        <section className="settings-section">
          <h3>Instruction wording</h3>
          <div className="field">
            <label htmlFor="wording-rule">Development rule to edit</label>
            <select
              id="wording-rule"
              value={ruleId}
              onChange={(event) => setRuleId(event.target.value)}
            >
              {source.rules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rule-wording">Rule wording</label>
            <textarea
              id="rule-wording"
              rows={3}
              maxLength={2048}
              value={profile.wording[ruleId] ?? rule.text}
              onChange={(event) =>
                update({
                  ...studio,
                  instructions: {
                    ...profile,
                    wording: { ...profile.wording, [ruleId]: event.target.value },
                  },
                })
              }
            />
            <p className="help">
              {profile.rules.includes(ruleId)
                ? 'This rule is enabled.'
                : 'This wording is saved but will only appear when its rule is enabled.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const wording = { ...profile.wording };
              delete wording[ruleId];
              update({ ...studio, instructions: { ...profile, wording } });
            }}
          >
            Restore built-in wording
          </button>
          <div className="field">
            <label htmlFor="wording-technology">Technology guidance to edit</label>
            <select
              id="wording-technology"
              value={technologyId}
              onChange={(event) => setTechnologyId(event.target.value)}
            >
              {source.technologies.map((technology) => (
                <option key={technology.id} value={technology.id}>
                  {technology.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="technology-wording">Technology wording</label>
            <textarea
              id="technology-wording"
              rows={3}
              maxLength={4096}
              value={profile.technologyWording[technologyId] ?? technology.instructions}
              onChange={(event) =>
                update({
                  ...studio,
                  instructions: {
                    ...profile,
                    technologyWording: {
                      ...profile.technologyWording,
                      [technologyId]: event.target.value,
                    },
                  },
                })
              }
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const technologyWording = { ...profile.technologyWording };
              delete technologyWording[technologyId];
              update({ ...studio, instructions: { ...profile, technologyWording } });
            }}
          >
            Restore technology wording
          </button>
        </section>
        <section className="settings-section">
          <h3>Optional project settings</h3>
          <p className="help">
            Generate only explicitly selected settings. Global preferences, authentication, models
            and MCP servers are left to each tool.
          </p>
          {studio.agents.includes('codex') && (
            <>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={studio.optionalConfig.codex}
                  onChange={(event) => setOptional({ codex: event.target.checked })}
                />
                Codex project configuration
              </label>
              {studio.optionalConfig.codex && (
                <label className="field">
                  <span className="control-label">Codex sandbox</span>
                  <select
                    value={studio.optionalConfig.codexSandbox}
                    onChange={(event) =>
                      setOptional({
                        codexSandbox: event.target
                          .value as AIStudio['optionalConfig']['codexSandbox'],
                      })
                    }
                  >
                    <option value="workspace-write">Workspace write · network off</option>
                    <option value="read-only">Read only</option>
                  </select>
                  <span className="help">
                    Uses on-request approvals. Project-local configuration is applied only when the
                    tool trusts the project.
                  </span>
                </label>
              )}
            </>
          )}
          {studio.agents.includes('claude') && (
            <>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={studio.optionalConfig.claude}
                  onChange={(event) => setOptional({ claude: event.target.checked })}
                />
                Claude project permission mode
              </label>
              {studio.optionalConfig.claude && (
                <label className="field">
                  <span className="control-label">Claude permission mode</span>
                  <select
                    value={studio.optionalConfig.claudeMode}
                    onChange={(event) =>
                      setOptional({
                        claudeMode: event.target.value as AIStudio['optionalConfig']['claudeMode'],
                      })
                    }
                  >
                    <option value="default">Standard permission prompts</option>
                    <option value="plan">Plan mode</option>
                  </select>
                </label>
              )}
            </>
          )}
          {studio.agents.includes('gemini') && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={studio.optionalConfig.gemini}
                onChange={(event) => setOptional({ gemini: event.target.checked })}
              />
              Gemini reads AGENTS.md directly{' '}
              <span className="help">replaces the GEMINI.md import</span>
            </label>
          )}
          {studio.agents.includes('opencode') && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={studio.optionalConfig.opencode}
                onChange={(event) => setOptional({ opencode: event.target.checked })}
              />
              OpenCode asks before editing or running shell commands
            </label>
          )}
        </section>
        <section className="settings-section">
          <h3>Scoped rules</h3>
          <p className="help">
            File rules generate native Claude, Copilot and Cursor files. Agent-requested rules
            target Cursor only. The other tools keep the shared project instructions.
          </p>
          {studio.scopedRules.map((rule) => (
            <div className="studio-saved-row" key={rule.id}>
              <span>
                {rule.name}
                <code className="help studio-role-description">
                  {rule.id} ·{' '}
                  {rule.mode === 'files' ? rule.patterns.join(', ') : 'Cursor agent-requested'}
                </code>
              </span>
              <div className="inline-actions">
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Edit scoped rule ${rule.name}`}
                  onClick={() => {
                    setDraft(structuredClone(rule));
                    setPatterns(rule.patterns.join(', '));
                    setEditingId(rule.id);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Remove scoped rule ${rule.name}`}
                  onClick={() => {
                    update({
                      ...studio,
                      scopedRules: studio.scopedRules.filter((r) => r.id !== rule.id),
                    });
                    if (editingId === rule.id) {
                      setEditingId(null);
                      setDraft(emptyRule());
                      setPatterns('');
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div className="field">
            <label htmlFor="scoped-id">Scoped rule file ID</label>
            <input
              id="scoped-id"
              value={draft.id}
              maxLength={48}
              placeholder="e.g. frontend-guidance"
              onChange={(event) => setDraft({ ...draft, id: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="scoped-name">Scoped rule name</label>
            <input
              id="scoped-name"
              value={draft.name}
              maxLength={120}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
          <label className="field">
            <span className="control-label">Rule activation</span>
            <select
              value={draft.mode}
              onChange={(event) =>
                setDraft({ ...draft, mode: event.target.value as ScopedRule['mode'] })
              }
            >
              <option value="files">Matching files · Claude, Copilot, Cursor</option>
              <option value="requested">Agent-requested · Cursor</option>
            </select>
          </label>
          {draft.mode === 'files' && (
            <div className="field">
              <label htmlFor="scoped-patterns">File patterns</label>
              <input
                id="scoped-patterns"
                value={patterns}
                placeholder="e.g. **/*.ts, **/*.tsx"
                maxLength={2048}
                onChange={(event) => setPatterns(event.target.value)}
              />
              <p className="help">
                Relative globs, separated by commas. No parent traversal or Windows drive paths.
              </p>
            </div>
          )}
          <div className="field">
            <label htmlFor="scoped-content">Scoped rule instructions</label>
            <textarea
              id="scoped-content"
              className="mono"
              rows={4}
              maxLength={8192}
              value={draft.content}
              onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            />
          </div>
          <div className="inline-actions">
            <button
              type="button"
              disabled={
                !draft.id ||
                !draft.name ||
                !draft.content.trim() ||
                (draft.mode === 'files' && !patterns.trim()) ||
                (!editingId && studio.scopedRules.length >= 12)
              }
              onClick={saveRule}
            >
              {editingId ? 'Save scoped rule' : 'Add scoped rule'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyRule());
                  setPatterns('');
                }}
              >
                Cancel edit
              </button>
            )}
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </details>
  );
}
