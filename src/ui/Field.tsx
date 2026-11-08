import { useId, type ReactNode } from 'react';
import { Icon } from '../icons';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

/** A labelled control with helper or error text wired through ids. Optional is stated in text. */
export function Field({
  label,
  helper,
  error,
  optional,
  children,
}: {
  label: string;
  helper?: string;
  error?: string;
  optional?: boolean;
  children: (control: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || helper;
  return (
    <div className="ui-field">
      <label className="ui-field-label" htmlFor={id}>
        {label}
        {optional && <span className="ui-field-optional">(Optional)</span>}
      </label>
      {children({
        id,
        'aria-describedby': note ? noteId : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {error ? (
        <span className="ui-field-error" id={noteId}>
          <Icon name="alert" size={16} />
          {error}
        </span>
      ) : (
        helper && (
          <span className="ui-field-helper" id={noteId}>
            {helper}
          </span>
        )
      )}
    </div>
  );
}
