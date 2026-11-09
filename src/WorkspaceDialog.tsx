import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Icon } from './icons';
import { keepDialogTab } from './ui/dialogKeys';

export function WorkspaceDialog({
  title,
  children,
  onClose,
  className = '',
  returnFocus,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = returnFocus?.current ?? document.activeElement;
    element.showModal();
    element.querySelector<HTMLElement>('[data-dialog-initial]')?.focus();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      className={`workspace-dialog rc-workspace-dialog ${className}`}
      ref={dialog}
      onKeyDown={keepDialogTab}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
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
