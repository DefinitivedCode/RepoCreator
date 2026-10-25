import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WorkspaceDialog } from './WorkspaceDialog';
import { addDetectedTechnologies } from './technologies';
import { appError } from './validation';
import type { ProjectTechnologies } from './types';
import type { TechnologyDetectionReport } from './workspaceTypes';

export function DetectedTechnologies({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value: ProjectTechnologies;
  onChange: (value: ProjectTechnologies) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    // The modal must be removed before its inert background can receive focus.
    if (!open && wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  function close() {
    setOpen(false);
  }
  return (
    <div className="technology-detection">
      <button
        ref={trigger}
        type="button"
        title="Inspect local project files and review suggestions"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Detect technologies
      </button>
      {open && (
        <DetectionReview projectId={projectId} value={value} onChange={onChange} onClose={close} />
      )}
    </div>
  );
}

function DetectionReview({
  projectId,
  value,
  onChange,
  onClose,
}: {
  projectId: string;
  value: ProjectTechnologies;
  onChange: (value: ProjectTechnologies) => void;
  onClose: () => void;
}) {
  const [report, setReport] = useState<TechnologyDetectionReport | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);
  async function scan() {
    const current = ++request.current;
    setLoading(true);
    setReport(null);
    setSelected([]);
    setError('');
    try {
      const result = await invoke<TechnologyDetectionReport>('detect_project_technologies', {
        id: projectId,
      });
      if (request.current !== current) return;
      setReport(result);
      setSelected(result.suggestions.map((item) => item.id));
    } catch (error) {
      if (request.current !== current) return;
      const detail = appError(error);
      setError([detail.message, detail.guidance].filter(Boolean).join(' '));
    } finally {
      if (request.current === current) setLoading(false);
    }
  }
  useEffect(() => {
    void scan();
    // Closing, navigation and a subsequent scan invalidate any late result.
    return () => {
      request.current += 1;
    };
  }, [projectId]);
  const available = report?.suggestions.filter((item) => !value.ids.includes(item.id)) ?? [];
  const additions = selected.filter((id) => available.some((item) => item.id === id));
  return (
    <WorkspaceDialog
      title="Detected technologies"
      onClose={onClose}
      className="technology-detection-dialog"
    >
      <div className="technology-detection-content">
        <p className="help">
          Choose suggestions to add to this form, then use Save project settings to keep them.
        </p>
        {loading && <p role="status">Inspecting project files…</p>}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {report && (
          <>
            <p role="status" className="help">
              {report.suggestions.length} detected · {additions.length} selected to add
            </p>
            {report.notices.map((notice) => (
              <p key={notice} className="help">
                {notice}
              </p>
            ))}
            {!report.suggestions.length ? (
              <p>
                No recognised technologies found in the inspected files. You can still choose
                technologies manually.
              </p>
            ) : (
              <>
                <div className="detection-selection-actions">
                  <button
                    type="button"
                    disabled={!available.length}
                    onClick={() => setSelected(available.map((item) => item.id))}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    disabled={!additions.length}
                    onClick={() => setSelected([])}
                  >
                    Deselect all
                  </button>
                </div>
                <ul className="detected-technology-list" aria-label="Technology suggestions">
                  {report.suggestions.map((item) => {
                    const added = value.ids.includes(item.id);
                    return (
                      <li key={item.id}>
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={added || selected.includes(item.id)}
                            disabled={added}
                            aria-describedby={`detected-${item.id}-evidence`}
                            onChange={(event) =>
                              setSelected((ids) =>
                                event.target.checked
                                  ? [...ids, item.id]
                                  : ids.filter((id) => id !== item.id),
                              )
                            }
                          />
                          <span>
                            {item.name}
                            {added && <small className="help"> · Already added</small>}
                          </span>
                        </label>
                        <ul id={`detected-${item.id}-evidence`} className="detection-evidence">
                          {item.evidence.map((evidence) => (
                            <li key={evidence.path}>
                              {evidence.description} <code>{evidence.path}</code>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      <div className="dialog-actions">
        <button type="button" disabled={loading} onClick={() => void scan()}>
          Rescan
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={loading || !additions.length}
          onClick={() => {
            onChange(addDetectedTechnologies(value, additions));
            onClose();
          }}
        >
          Add selected{additions.length ? ` (${additions.length})` : ''}
        </button>
      </div>
    </WorkspaceDialog>
  );
}
