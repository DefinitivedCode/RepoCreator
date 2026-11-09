import type { ReactNode } from 'react';
import type { AppError } from '../types';

export function InlineProblem({
  error,
  action,
  id,
}: {
  error: Pick<AppError, 'message' | 'guidance'>;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="ui-inline-problem" id={id}>
      <div role="alert">
        <strong>{error.message}</strong>
        {error.guidance && <p>{error.guidance}</p>}
      </div>
      {action}
    </div>
  );
}
