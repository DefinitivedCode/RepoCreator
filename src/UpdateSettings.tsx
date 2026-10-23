import type { Updates } from './useUpdates';
import { lazy, Suspense } from 'react';
import './updates.css';

const ReleaseNotes = lazy(() => import('./ReleaseNotes'));

export function UpdateSettings({ updates }: { updates: Updates }) {
  const { info, settings, offer, phase, progress, busy } = updates;
  const percent = progress.total
    ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
    : undefined;
  return (
    <div className="update-settings">
      <div>
        <h3>Updates</h3>
        <p className="help">Installed version: {info?.currentVersion ?? 'Loading…'}</p>
      </div>
      <label className="field">
        <span>Update channel</span>
        <select
          value={settings.channel}
          disabled={busy}
          onChange={(event) =>
            void updates.save({ ...settings, channel: event.target.value as 'stable' | 'beta' })
          }
        >
          <option value="stable">Stable</option>
          <option value="beta">Beta</option>
        </select>
      </label>
      <p className="help">
        Stable receives published stable releases. Beta also receives prereleases. Switching
        channels never installs an older version.
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={settings.automatic}
          disabled={busy}
          onChange={(event) => void updates.save({ ...settings, automatic: event.target.checked })}
        />
        Automatically check for updates at startup
      </label>
      <div>
        <button
          type="button"
          disabled={busy || !info?.configured}
          onClick={() => void updates.check()}
        >
          Check for Updates
        </button>
      </div>
      <p role="status">{updates.status}</p>
      {updates.error && (
        <p className="inline-error" role="alert">
          {updates.error}
        </p>
      )}
      {offer && (
        <section className="update-offer" aria-label="Available update">
          <h4>Repo Creator {offer.version}</h4>
          <h5>Release notes</h5>
          <Suspense
            fallback={
              <p className="help" role="status">
                Loading release notes…
              </p>
            }
          >
            <ReleaseNotes>{offer.notes}</ReleaseNotes>
          </Suspense>
          {phase === 'downloading' && (
            <div role="status">
              <p>
                Downloading update…{' '}
                {percent === undefined
                  ? `${(progress.downloaded / 1048576).toFixed(1)} MiB`
                  : `${percent}%`}
              </p>
              <progress aria-label="Update download" max={100} value={percent} />
              <button type="button" onClick={() => void updates.cancel()}>
                Cancel download
              </button>
            </div>
          )}
          {phase === 'ready' && (
            <p className="help">
              Save your work before continuing. Updating will close Repo Creator and stop its
              running commands.
            </p>
          )}
          {phase === 'installing' && <p role="status">Installing update and restarting…</p>}
          <div className="inline-actions">
            {phase === 'available' && (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void updates.download()}
              >
                Download update
              </button>
            )}
            {phase === 'ready' && (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void updates.install()}
              >
                Update and Restart
              </button>
            )}
            <button type="button" disabled={busy} onClick={updates.later}>
              Later
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
