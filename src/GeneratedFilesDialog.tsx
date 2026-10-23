import { useEffect, useRef } from 'react';
import { FilePreview } from './ConfigurationPanels';
import { Icon } from './icons';
import { normalizeProjectName } from './projectName';
import type { Creator } from './useCreator';

export function GeneratedFilesDialog({
  creator,
  initialPath,
  onClose,
}: {
  creator: Creator;
  initialPath: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="generated-files-dialog"
      aria-labelledby="generated-files-title"
      onCancel={onClose}
    >
      <div className="dialog-header">
        <h2 id="generated-files-title">Generated files</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close file preview"
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="dialog-content">
        <FilePreview
          name={normalizeProjectName(creator.form!.name) || 'project-name'}
          files={creator.files}
          initialPath={initialPath}
          loading={creator.previewing}
          error={creator.previewError}
          expanded
        />
      </div>
    </dialog>
  );
}
