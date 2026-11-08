import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A modal native <dialog>, with the same handling as WorkspaceDialog: it opens with
 * showModal (focus trap and inert background from the platform), Escape calls
 * onClose, and focus returns to what had it before the dialog opened. Use for
 * confirmations and file viewers only.
 */
export function Dialog({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus?.();
    };
  }, []);
  return (
    <dialog
      className="ui-dialog"
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="ui-dialog-body">
        <h2 className="ui-dialog-title" id={titleId}>
          {title}
        </h2>
        <div className="ui-dialog-content">{children}</div>
        {footer && <div className="ui-dialog-footer">{footer}</div>}
      </div>
    </dialog>
  );
}
