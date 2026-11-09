import { useState } from 'react';
import { Icon } from '../icons';
import { technologySummary } from '../technologies';
import type { Creator } from '../useCreator';
import type { Configuration, ProjectPreset } from '../types';
import { appError } from '../validation';
import { Button, Dialog } from '../ui';

const isCustom = (preset: ProjectPreset) => preset.id.startsWith('custom-');

function uniqueName(base: string, taken: string[]): string {
  const lower = taken.map((name) => name.toLowerCase());
  let candidate = `${base} copy`;
  for (let n = 2; lower.includes(candidate.toLowerCase()); n++) candidate = `${base} copy ${n}`;
  return candidate.slice(0, 60);
}

/**
 * The Presets page: what a preset is, built-in and your own presets as rows, and
 * Use, Duplicate and (custom only) Edit and Delete. Editing uses the existing
 * preset manager so its behaviour is unchanged.
 */
export function PresetLibrary({
  creator,
  presets,
  onUse,
  onEdit,
  onManage,
}: {
  creator: Creator;
  presets: ProjectPreset[];
  onUse: (configuration: Configuration, id: string) => void;
  onEdit: (preset: ProjectPreset) => void;
  onManage: () => void;
}) {
  const [deleting, setDeleting] = useState<ProjectPreset | null>(null);
  const builtIn = presets.filter((preset) => !isCustom(preset));
  const yours = presets.filter(isCustom);

  async function duplicate(preset: ProjectPreset) {
    try {
      await creator.managePreset('save_custom_preset', {
        name: uniqueName(
          preset.name,
          presets.map((item) => item.name),
        ),
        description: preset.description,
        configuration: preset.configuration,
      });
      creator.setNotice(`Duplicated “${preset.name}”. Your copy is under Yours.`);
    } catch (value) {
      creator.setNotice(appError(value).message);
    }
  }
  async function remove(preset: ProjectPreset) {
    setDeleting(null);
    try {
      await creator.managePreset('delete_custom_preset', { id: preset.id });
      creator.setNotice(`Deleted “${preset.name}”.`);
    } catch (value) {
      creator.setNotice(appError(value).message);
    }
  }

  const row = (preset: ProjectPreset) => (
    <article key={preset.id} className="workspace-card preset-card">
      <h4>{preset.name}</h4>
      <p className="help">{preset.description || 'A reusable project configuration.'}</p>
      <p className="preset-details">
        {technologySummary(preset.configuration.options.technologies ?? { ids: [], custom: [] })}
        <span>
          {preset.configuration.options.commands?.length ?? 0} commands ·{' '}
          {preset.configuration.options.ai.enabled
            ? preset.configuration.options.ai.agents.length
            : 0}{' '}
          assistants
        </span>
      </p>
      <div className="inline-actions preset-actions">
        <Button
          variant="primary"
          size="compact"
          onClick={() => onUse(preset.configuration, preset.id)}
          aria-label={`Use preset ${preset.name}`}
        >
          Use preset <Icon name="arrow" size={14} />
        </Button>
        <Button
          size="compact"
          onClick={() => void duplicate(preset)}
          aria-label={`Duplicate ${preset.name}`}
        >
          Duplicate
        </Button>
        {isCustom(preset) && (
          <>
            <Button
              size="compact"
              onClick={() => onEdit(preset)}
              aria-label={`Edit ${preset.name}`}
            >
              Edit
            </Button>
            <Button
              size="compact"
              variant="danger"
              onClick={() => setDeleting(preset)}
              aria-label={`Delete ${preset.name}`}
            >
              Delete
            </Button>
          </>
        )}
      </div>
    </article>
  );

  return (
    <main className="library-page" aria-label="Project presets">
      <div className="page-heading">
        <div>
          <h2>Presets</h2>
          <p className="help">
            A preset is a saved set of files, technologies, assistants and commands you can start a
            project from.
          </p>
        </div>
        <button type="button" className="primary" onClick={onManage}>
          Manage presets
        </button>
      </div>
      <section aria-labelledby="presets-yours">
        <h3 id="presets-yours">Yours</h3>
        {yours.length ? (
          <div className="preset-library">{yours.map(row)}</div>
        ) : (
          <p className="help">
            You have no presets yet. Duplicate a built-in preset to make your own.
          </p>
        )}
      </section>
      <section aria-labelledby="presets-built-in">
        <h3 id="presets-built-in">Built-in</h3>
        <div className="preset-library">{builtIn.map(row)}</div>
      </section>
      {deleting && (
        <Dialog
          title="Delete preset?"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => void remove(deleting)}>
                Delete preset
              </Button>
            </>
          }
        >
          <p>
            <strong>{deleting.name}</strong> will be deleted. Projects already created from it are
            not changed.
          </p>
        </Dialog>
      )}
      {creator.notice && (
        <p className="notice" role="status">
          {creator.notice}
        </p>
      )}
    </main>
  );
}
