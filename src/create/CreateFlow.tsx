import { useEffect, useRef } from 'react';
import type { Blocker, Fix } from '../blockers';
import { Button, Dialog } from '../ui';

/**
 * Opened by activating the unavailable Create button. Lists what is missing with a
 * fix for each. Escape or choosing a fix closes it and returns focus to the button.
 */
export function BlockerPopover({
  blockers,
  onFix,
  onClose,
}: {
  blockers: Blocker[];
  onFix: (fix: Fix) => void;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section
      className="blocker-popover"
      role="dialog"
      aria-labelledby="blocker-popover-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <h3 id="blocker-popover-title" tabIndex={-1} ref={heading}>
        To create this project
      </h3>
      <ul>
        {blockers.map((blocker) => (
          <li key={blocker.id}>
            <span>{blocker.title}</span>{' '}
            {blocker.fix && (
              <Button
                size="compact"
                variant="tertiary"
                onClick={() => {
                  onFix(blocker.fix!);
                  onClose();
                }}
              >
                {blocker.fix.label}
              </Button>
            )}
            {blocker.alternative && (
              <Button
                size="compact"
                variant="tertiary"
                onClick={() => {
                  onFix(blocker.alternative!);
                  onClose();
                }}
              >
                {blocker.alternative.label}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button size="compact" onClick={onClose}>
        Close
      </Button>
    </section>
  );
}

/** Shown only before publishing to GitHub: names exactly what will be created. */
export function ConfirmPublish({
  owner,
  name,
  visibility,
  branch,
  onConfirm,
  onCancel,
}: {
  owner: string;
  name: string;
  visibility: 'private' | 'public';
  branch: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      title="Create on GitHub?"
      onClose={onCancel}
      footer={
        <>
          {/* Cancel comes first so it receives focus when the dialog opens. */}
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm}>
            Create on GitHub
          </Button>
        </>
      }
    >
      <p>
        This creates <strong>{owner ? `${owner}/${name}` : name}</strong> on GitHub and pushes the
        first commit.
      </p>
      <dl className="confirm-details">
        <dt>Visibility</dt>
        <dd>
          {visibility === 'public'
            ? 'Public. Anyone on the internet can see it.'
            : 'Private. Only you and people you choose.'}
        </dd>
        <dt>Branch</dt>
        <dd>{branch}</dd>
      </dl>
    </Dialog>
  );
}
