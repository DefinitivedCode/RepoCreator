import { useState } from 'react';
import { Icon } from './icons';
import { SyntaxPreview } from './SyntaxPreview';
import type { Creator } from './useCreator';

/** Presentation only: preview content always comes from the shared Rust generator. */
export function FocusedFilePreview({
  creator,
  paths,
  title = 'Generated file',
}: {
  creator: Creator;
  paths: string[];
  title?: string;
}) {
  const [selected, setSelected] = useState(paths[0]);
  const available = creator.files.filter((file) => paths.includes(file.path));
  const file = available.find((file) => file.path === selected) ?? available[0];
  return (
    <section className="focused-file-preview" aria-label={title}>
      <div className="focused-preview-toolbar">
        <div>
          <Icon name="file" size={15} />
          <strong>{file?.path ?? title}</strong>
        </div>
        {file && (
          <button
            type="button"
            className="icon-button"
            aria-label={`Copy ${file.path}`}
            onClick={() => void creator.copy(file.content)}
          >
            <Icon name="copy" size={14} />
          </button>
        )}
      </div>
      {available.length > 1 && (
        <div className="focused-preview-tabs" role="group" aria-label="Related generated files">
          {available.map((entry) => (
            <button
              type="button"
              key={entry.path}
              aria-pressed={entry.path === file?.path}
              onClick={() => setSelected(entry.path)}
            >
              {entry.path}
            </button>
          ))}
        </div>
      )}
      {creator.previewError ? (
        <p className="inline-error" role="alert">
          {creator.previewError}
        </p>
      ) : creator.previewing ? (
        <p className="preview-placeholder" role="status">
          Updating preview…
        </p>
      ) : file ? (
        <SyntaxPreview path={file.path} content={file.content} />
      ) : (
        <div className="preview-placeholder">
          <Icon name="file" size={24} />
          <p>No file selected for generation.</p>
          <span className="help">Enable an option to preview its exact contents.</span>
        </div>
      )}
      <div className="focused-preview-footer">
        <span className="status-dot" />
        Exact generated content · included in the first commit
      </div>
    </section>
  );
}
