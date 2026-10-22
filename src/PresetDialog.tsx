import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from './icons';
import { appError, configurationOf } from './validation';
import type { Configuration, ProjectPreset } from './types';
import type { Creator } from './useCreator';

interface Exchange {
  schemaVersion: number;
  name: string;
  description: string;
  configuration: Configuration;
}

function included(configuration: Configuration): string {
  const { options } = configuration;
  return [
    configuration.readme !== 'none' ? `${configuration.readme} README` : 'No README',
    `${options.ignorePresets.length} ignore groups`,
    options.license === 'none' ? 'No license' : options.license,
    options.ai.enabled ? options.ai.agents.join(', ') : 'No AI assistant',
    `${options.ai.instructions.rules.length} instruction rules`,
    `${options.ai.specialists.length} specialists`,
    `${options.ai.skills.length} skills`,
    `${options.commands?.length ?? 0} command templates`,
    `${configuration.destination ?? 'local'} destination`,
    `${configuration.visibility ?? 'private'} visibility`,
    `${configuration.handoffTemplate ?? 'discovery'} handoff`,
  ].join(' · ');
}

export function PresetDialog({
  creator,
  configurationOverride,
  onClose,
  onSaved,
  onApply,
}: {
  creator: Creator;
  configurationOverride?: Configuration;
  onClose: () => void;
  onSaved: (id: string) => void;
  onApply: (configuration: Configuration, id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [source, setSource] = useState<Configuration | null>(null);
  const [sourceName, setSourceName] = useState('Current project settings');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [imported, setImported] = useState<Exchange | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function run(operation: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await operation();
    } catch (value) {
      const error = appError(value);
      setError(`${error.message} ${error.guidance}`);
    } finally {
      setPending(false);
    }
  }
  function clearEditor() {
    setEditing(null);
    setName('');
    setDescription('');
    setSource(null);
    setSourceName('Current project settings');
    setImported(null);
  }
  async function save() {
    if (!creator.form) return;
    const configuration = source ?? configurationOverride ?? configurationOf(creator.form);
    await run(async () => {
      if (editing) {
        await creator.managePreset('update_custom_preset', {
          id: editing,
          name,
          description,
          configuration,
        });
        setMessage('Preset updated. Your current project settings are preserved.');
      } else {
        const presets = imported
          ? await creator.managePreset('confirm_project_preset_import', {
              preset: { schemaVersion: 1, name, description, configuration },
            })
          : await creator.managePreset('save_custom_preset', { name, description, configuration });
        setMessage(`Saved “${presets[presets.length - 1].name}”.`);
      }
      clearEditor();
    });
  }
  function edit(preset: ProjectPreset, useCurrent = false) {
    setEditing(preset.id);
    setName(preset.name);
    setDescription(preset.description ?? '');
    setSource(
      useCurrent && creator.form
        ? (configurationOverride ?? configurationOf(creator.form))
        : preset.configuration,
    );
    setSourceName(useCurrent ? 'Current project settings' : preset.name);
    setImported(null);
    setDeleting(null);
    document.getElementById('preset-name')?.focus();
  }
  function duplicate(preset: ProjectPreset) {
    setEditing(null);
    setName(`${preset.name.slice(0, 54)} copy`);
    setDescription(preset.description ?? '');
    setSource(preset.configuration);
    setSourceName(preset.name);
    setImported(null);
    document.getElementById('preset-name')?.focus();
  }
  function apply(preset: ProjectPreset) {
    onApply(preset.configuration, preset.id);
    onSaved(preset.id);
    onClose();
  }
  async function exportPreset(preset?: ProjectPreset) {
    if (!creator.form) return;
    await run(async () => {
      const exported = await invoke<boolean>('export_project_preset', {
        preset: {
          schemaVersion: 1,
          name: preset?.name ?? (name.trim() || 'My project workflow'),
          description: preset?.description ?? description,
          configuration:
            preset?.configuration ??
            source ??
            configurationOverride ??
            configurationOf(creator.form!),
        },
      });
      if (exported)
        setMessage(
          'Exported portable JSON. Folder locations and project Git identity are excluded. Review custom text before sharing.',
        );
    });
  }
  async function previewImport() {
    await run(async () => {
      const preset = await invoke<Exchange | null>('preview_project_preset_import');
      if (preset) {
        setImported(preset);
        setName(preset.name);
        setDescription(preset.description);
        setEditing(null);
        setSource(preset.configuration);
        setSourceName('Imported preset preview');
      }
    });
  }

  return (
    <dialog
      ref={dialog}
      className="preset-dialog"
      aria-labelledby="preset-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-header">
        <h2 id="preset-title">Project Preset Studio</h2>
        <button className="icon-button" type="button" aria-label="Close presets" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="dialog-content">
        <p className="help">
          Save files, Git settings, AI instructions and handoff preferences together. Project names,
          save locations and GitHub credentials are excluded. Built-in presets always retain their
          original defaults.
        </p>
        <div className="inline-actions">
          <button type="button" disabled={pending} onClick={() => void previewImport()}>
            Import JSON…
          </button>
          <button type="button" disabled={pending} onClick={() => void exportPreset()}>
            Export current settings…
          </button>
        </div>
        {imported && (
          <section className="import-preview" aria-label="Import preview">
            <h3>Review import</h3>
            <p>
              <strong>{imported.name}</strong> —{' '}
              {imported.description || 'No description provided.'}
            </p>
            <p className="help">{included(imported.configuration)}</p>
            <p className="help">
              Import saves a new preset. Instructions are data; nothing is executed, installed,
              downloaded or applied. Change the name below if it already exists.
            </p>
          </section>
        )}
        <div className="field">
          <label htmlFor="preset-name">
            {editing
              ? 'Edit custom preset'
              : imported
                ? 'Import as a new preset'
                : 'Save a new custom preset'}
          </label>
          <input
            id="preset-name"
            value={name}
            maxLength={60}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void save();
              }
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="preset-description">Description</label>
          <input
            id="preset-description"
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <p className="help">
          Source: {sourceName}
          {configurationOverride ? ' · Includes workspace command templates' : ''}
        </p>
        <div className="inline-actions">
          <button
            className="primary"
            type="button"
            disabled={!name.trim() || pending}
            onClick={() => void save()}
          >
            {editing ? 'Save changes to preset' : imported ? 'Confirm import' : 'Save preset'}
          </button>
          {(editing || source) && (
            <button type="button" disabled={pending} onClick={clearEditor}>
              Cancel edit
            </button>
          )}
        </div>
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
        <h3 className="saved-heading">Custom presets</h3>
        {!creator.preferences?.customPresets.length ? (
          <p className="help">No custom presets saved.</p>
        ) : (
          <ul className="saved-presets">
            {creator.preferences.customPresets.map((preset) => (
              <li key={preset.id}>
                <strong>{preset.name}</strong>
                {preset.description && <p className="help">{preset.description}</p>}
                <p className="help">{included(preset.configuration)}</p>
                <div className="inline-actions">
                  <button type="button" disabled={pending} onClick={() => apply(preset)}>
                    Load
                  </button>
                  <button type="button" disabled={pending} onClick={() => edit(preset)}>
                    Edit / rename
                  </button>
                  <button type="button" disabled={pending} onClick={() => edit(preset, true)}>
                    Replace with current
                  </button>
                  <button type="button" disabled={pending} onClick={() => duplicate(preset)}>
                    Duplicate
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void exportPreset(preset)}
                  >
                    Export…
                  </button>
                  <button
                    type="button"
                    className="danger"
                    disabled={pending}
                    onClick={() => setDeleting(preset.id)}
                  >
                    Delete
                  </button>
                </div>
                {deleting === preset.id && (
                  <div className="delete-confirm">
                    <p>Delete “{preset.name}”? Your project settings will be kept.</p>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="danger"
                        disabled={pending}
                        onClick={() =>
                          void run(async () => {
                            await creator.managePreset('delete_custom_preset', { id: preset.id });
                            setDeleting(null);
                            if (editing === preset.id) clearEditor();
                          })
                        }
                      >
                        Delete preset
                      </button>
                      <button type="button" onClick={() => setDeleting(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <h3 className="saved-heading">Built-in defaults</h3>
        <p className="help">Load to restore a starting point, or duplicate to customise it.</p>
        <ul className="saved-presets">
          {creator.catalog?.builtInPresets.map((preset) => (
            <li key={preset.id}>
              <strong>{preset.name}</strong>
              <p className="help">{preset.description || included(preset.configuration)}</p>
              <div className="inline-actions">
                <button type="button" disabled={pending} onClick={() => apply(preset)}>
                  Load defaults
                </button>
                <button type="button" disabled={pending} onClick={() => duplicate(preset)}>
                  Duplicate
                </button>
                <button type="button" disabled={pending} onClick={() => void exportPreset(preset)}>
                  Export…
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
