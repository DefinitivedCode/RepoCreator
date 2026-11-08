import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './Button';

export interface ToastMessage {
  id: number;
  text: string;
}

/** Completed-action messages: announced politely, dismissed after five seconds. */
export function useToasts(duration = 5000) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const push = useCallback(
    (text: string) => {
      const id = next.current++;
      setToasts((current) => [...current, { id, text }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
      return id;
    },
    [dismiss, duration],
  );
  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);
  return { toasts, push, dismiss };
}

/** The live region stays mounted even when empty so announcements are reliable. */
export function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="ui-toast-region" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className="ui-toast" key={toast.id}>
          <span>{toast.text}</span>
          <Button variant="tertiary" size="compact" onClick={() => onDismiss(toast.id)}>
            Dismiss
          </Button>
        </div>
      ))}
    </div>
  );
}
