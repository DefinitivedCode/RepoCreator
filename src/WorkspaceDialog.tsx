import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';

export function WorkspaceDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="workspace-dialog rc-workspace-dialog"
      ref={dialog}
      onCancel={onClose}
      aria-label={title}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <Icon name="close" size={17} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
