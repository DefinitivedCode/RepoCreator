import { useRef, useState } from 'react';
import type { AIStudio, Specialist } from './aiTypes';
import type { Creator } from './useCreator';
import { appError } from './validation';

const emptyRole = (): Specialist => ({
  id: '',
  name: '',
  description: '',
  purpose: '',
  instructions: '',
  readOnly: true,
  agents: ['codex', 'claude', 'copilot', 'opencode'],
});

export function SpecialistEditor({
  studio,
  update,
  creator,
}: {
  studio: AIStudio;
  update: (next: AIStudio) => void;
  creator: Creator;
}) {
  const [draft, setDraft] = useState<Specialist>(emptyRole);
  const [savedId, setSavedId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const editor = useRef<HTMLDetailsElement>(null);
  const source = creator.catalog!.studio;
  const saved = creator.preferences?.specialistLibrary ?? [];
  const roles = [...source.specialists, ...studio.customSpecialists];
  const compatible = studio.agents.some(
    (agent) => source.agents.find((a) => a.id === agent)?.specialists,
  );
  function include(role: Specialist) {
    if (
      !studio.customSpecialists.some((r) => r.id === role.id) &&
      studio.customSpecialists.length >= 12
    ) {
      setError('Use up to 12 custom specialists per configuration. Remove an unused role first.');
      return;
    }
    update({
      ...studio,
      customSpecialists: [
        ...studio.customSpecialists.filter((r) => r.id !== role.id),
        structuredClone(role),
      ],
      specialists: studio.specialists.includes(role.id)
        ? studio.specialists
        : [...studio.specialists, role.id],
    });
  }
  async function save() {
    setError('');
    setMessage('');
    if (
      !studio.customSpecialists.some((r) => r.id === draft.id) &&
      studio.customSpecialists.length >= 12
    ) {
      setError('Use up to 12 custom specialists per configuration. Remove an unused role first.');
      return;
    }
    try {
      await creator.studioAction('save_specialist', { role: draft });
      include(draft);
      setMessage('Specialist saved and selected for this configuration.');
    } catch (value) {
      setError(appError(value).message);
    }
  }
  async function removeSaved() {
    setError('');
    setMessage('');
    try {
      await creator.studioAction('delete_specialist', { id: savedId });
      setDeleting(false);
      setSavedId('');
      setMessage('Library entry deleted. Any copy in this configuration was kept.');
    } catch (value) {
      setError(appError(value).message);
    }
  }
  return (
    <details className="studio-subsection specialist-panel">
      <summary>
        Specialist agents <span className="help">{studio.specialists.length} selected</span>
      </summary>
      <div className="studio-section-body">
        <p className="help">
          Native profiles for Codex, Claude Code, Copilot and OpenCode. Models inherit from the
          user’s session. Review roles request no edits; Codex inherits parent permissions, so its
          read-only intent is not a separate sandbox.
        </p>
        {!compatible && (
          <p className="help">
            No specialist files will be generated for the currently selected tools.
          </p>
        )}
        <div className="studio-role-list">
          {roles.map((role) => (
            <div className="studio-role" key={role.id}>
              <label className="check-label" title={role.description}>
                <input
                  type="checkbox"
                  aria-label={role.name}
                  checked={studio.specialists.includes(role.id)}
                  onChange={() =>
                    update({
                      ...studio,
                      specialists: studio.specialists.includes(role.id)
                        ? studio.specialists.filter((id) => id !== role.id)
                        : [...studio.specialists, role.id],
                    })
                  }
                />
                <span>
                  {role.name}
                  <span className="help studio-role-description">{role.description}</span>
                </span>
              </label>
              <div className="inline-actions studio-actions">
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Edit ${role.name} specialist`}
                  onClick={() => {
                    setDraft({
                      ...structuredClone(role),
                      id: role.id.startsWith('custom-') ? role.id : `custom-${role.id}`,
                    });
                    if (editor.current) editor.current.open = true;
                  }}
                >
                  Edit copy
                </button>
                {role.id.startsWith('custom-') && (
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Remove ${role.name} from configuration`}
                    onClick={() =>
                      update({
                        ...studio,
                        specialists: studio.specialists.filter((id) => id !== role.id),
                        customSpecialists: studio.customSpecialists.filter((r) => r.id !== role.id),
                      })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {!!saved.length && (
          <>
            <div className="field">
              <label htmlFor="saved-specialist">Saved specialist</label>
              <select
                id="saved-specialist"
                value={savedId}
                onChange={(event) => {
                  setSavedId(event.target.value);
                  setDeleting(false);
                }}
              >
                <option value="">Choose a library entry…</option>
                {saved.map((role) => (
                  <option value={role.id} key={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="inline-actions studio-actions">
              <button
                type="button"
                disabled={!savedId}
                onClick={() => {
                  const role = saved.find((r) => r.id === savedId);
                  if (role) {
                    include(role);
                    setDraft(structuredClone(role));
                  }
                }}
              >
                Use saved specialist
              </button>
              <button
                type="button"
                className="text-button danger"
                disabled={!savedId}
                onClick={() => setDeleting(true)}
              >
                Delete library entry
              </button>
            </div>
            {deleting && (
              <div className="delete-confirm">
                <p>
                  Delete this saved specialist? Copies in configurations and project presets will be
                  kept.
                </p>
                <div className="inline-actions">
                  <button type="button" className="danger" onClick={() => void removeSaved()}>
                    Delete saved specialist
                  </button>
                  <button type="button" onClick={() => setDeleting(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <details className="studio-subsection" ref={editor}>
          <summary>Custom specialist editor</summary>
          <div className="studio-section-body">
            <div className="field">
              <label htmlFor="specialist-template">Start from a role</label>
              <select
                id="specialist-template"
                value=""
                onChange={(event) => {
                  const role = source.specialists.find((r) => r.id === event.target.value);
                  setDraft(
                    role ? { ...structuredClone(role), id: `custom-${role.id}` } : emptyRole(),
                  );
                }}
              >
                <option value="">Choose a template or write your own…</option>
                {source.specialists.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="specialist-id">Specialist file ID</label>
              <input
                id="specialist-id"
                value={draft.id}
                maxLength={48}
                placeholder="custom-my-reviewer"
                onChange={(event) => setDraft({ ...draft, id: event.target.value })}
              />
              <p className="help">
                Start with custom-. Use lowercase letters, digits and hyphens; up to 48 characters.
              </p>
            </div>
            <div className="field">
              <label htmlFor="specialist-name">Specialist name</label>
              <input
                id="specialist-name"
                value={draft.name}
                maxLength={100}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="specialist-description">Specialist description</label>
              <input
                id="specialist-description"
                value={draft.description}
                maxLength={512}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="specialist-purpose">Specialist purpose</label>
              <textarea
                id="specialist-purpose"
                rows={2}
                value={draft.purpose}
                maxLength={2048}
                onChange={(event) => setDraft({ ...draft, purpose: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="specialist-instructions">Specialist instructions</label>
              <textarea
                className="mono"
                id="specialist-instructions"
                rows={5}
                value={draft.instructions}
                maxLength={12_000}
                onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
              />
            </div>
            <h3>Supported coding agents</h3>
            <div className="checkbox-grid">
              {source.agents
                .filter((a) => a.specialists)
                .map((agent) => (
                  <label className="check-label" key={agent.id}>
                    <input
                      type="checkbox"
                      aria-label={`Specialist target ${agent.name}`}
                      checked={draft.agents.includes(agent.id)}
                      onChange={() =>
                        setDraft({
                          ...draft,
                          agents: draft.agents.includes(agent.id)
                            ? draft.agents.filter((id) => id !== agent.id)
                            : [...draft.agents, agent.id],
                        })
                      }
                    />
                    {agent.name}
                  </label>
                ))}
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={draft.readOnly}
                onChange={(event) => setDraft({ ...draft, readOnly: event.target.checked })}
              />
              Review only · restrict tools where supported
            </label>
            <button
              type="button"
              disabled={
                !draft.id ||
                !draft.name ||
                !draft.description ||
                !draft.purpose ||
                !draft.instructions ||
                !draft.agents.length
              }
              onClick={() => void save()}
            >
              {saved.some((role) => role.id === draft.id)
                ? 'Update saved specialist'
                : 'Save specialist'}
            </button>
          </div>
        </details>
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
