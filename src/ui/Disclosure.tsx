import { useId, useState, type ReactNode } from 'react';
import { Icon } from '../icons';

/** A whole-row toggle (use for "Customize" regions). Controlled or uncontrolled. */
export function Disclosure({
  title,
  summary,
  open,
  defaultOpen = false,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const expanded = open ?? inner;
  const bodyId = useId();
  return (
    <div className="ui-disclosure">
      <button
        type="button"
        className="ui-disclosure-trigger"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => {
          setInner(!expanded);
          onToggle?.(!expanded);
        }}
      >
        <span className="ui-disclosure-chevron">
          <Icon name="chevron" size={16} />
        </span>
        {title}
        {summary && <span className="ui-disclosure-summary">{summary}</span>}
      </button>
      <div className="ui-disclosure-body" id={bodyId} hidden={!expanded}>
        {children}
      </div>
    </div>
  );
}
