import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { appError, configurationOf } from './validation';
import type { Creator } from './useCreator';

export function PresetDialog({
  creator,
  onClose,
  onSaved,
}: {
  creator: Creator;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function save() {
    if (!creator.form || pending) return;
    setPending(true);
    setError('');
    try {
      const presets = await creator.managePreset(
        editing ? 'rename_custom_preset' : 'save_custom_preset',
        editing ? { id: editing, name } : { name, configuration: configurationOf(creator.form) },
      );
      if (!editing) {
        onSaved(presets[presets.length - 1].id);
        onClose();
      } else {
        setEditing(null);
        setName('');
      }
    } catch (value) {
      setError(appError(value).message);
    } finally {
      setPending(false);
    }
  }
  async function remove(id: string) {
    if (pending) return;
    setPending(true);
    try {
      await creator.managePreset('delete_custom_preset', { id });
      setDeleting(null);
      if (editing === id) {
        setEditing(null);
        setName('');
      }
    } catch (value) {
      setError(appError(value).message);
    } finally {
      setPending(false);
    }
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
        <h2 id="preset-title">Project presets</h2>
        <button className="icon-button" type="button" aria-label="Close presets" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="dialog-content">
        <p className="help">
          Save destination, visibility, files, Git settings and AI Agents together. Project names,
          descriptions and GitHub credentials are not saved.
        </p>
        <div className="field">
          <label htmlFor="preset-name">
            {editing ? 'Rename preset' : 'Save current configuration as'}
          </label>
          <div className="inline-actions">
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
            <button
              className="primary"
              type="button"
              disabled={!name.trim() || pending}
              onClick={() => void save()}
            >
              {editing ? 'Rename' : 'Save preset'}
            </button>
          </div>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <h3 className="saved-heading">Saved presets</h3>
        {!creator.preferences?.customPresets.length ? (
          <p className="help">No custom presets saved.</p>
        ) : (
          <ul className="saved-presets">
            {creator.preferences.customPresets.map((preset) => (
              <li key={preset.id}>
                <div className="saved-preset-row">
                  <span>{preset.name}</span>
                  <button
                    type="button"
                    className="text-button"
                    disabled={pending}
                    onClick={() => {
                      creator.configure(preset.configuration);
                      onSaved(preset.id);
                      onClose();
                    }}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={pending}
                    onClick={() => {
                      setEditing(preset.id);
                      setName(preset.name);
                      setDeleting(null);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="text-button danger"
                    disabled={pending}
                    onClick={() => setDeleting(preset.id)}
                  >
                    Delete
                  </button>
                </div>
                {deleting === preset.id && (
                  <div className="delete-confirm">
                    <p>Delete “{preset.name}”? Your current configuration will be kept.</p>
                    <div className="inline-actions">
                      <button
                        className="danger"
                        type="button"
                        disabled={pending}
                        onClick={() => void remove(preset.id)}
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
      </div>
    </dialog>
  );
}
