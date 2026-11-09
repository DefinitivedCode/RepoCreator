import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface MenuAction {
  id: string;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * Overflow menu: a button that opens a list of actions (menu button pattern). Arrow keys move,
 * Home/End jump, Escape closes and returns focus, Tab leaves. Nothing runs until an item is chosen.
 */
export function Menu({
  label,
  actions,
  disabled = false,
  children,
}: {
  /** Accessible name of the trigger, for example "More actions for Build". */
  label: string;
  actions: MenuAction[];
  disabled?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus();
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const items = () => [
    ...(root.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)') ?? []),
  ];
  return (
    <div
      className="ui-menu"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="ui-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children ?? <span aria-hidden="true">⋯</span>}
      </button>
      {open && (
        <div
          className="ui-menu-list"
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            const all = items();
            const index = all.indexOf(document.activeElement as HTMLElement);
            if (event.key === 'Escape') {
              event.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const step = event.key === 'ArrowDown' ? 1 : -1;
              all[(index + step + all.length) % all.length]?.focus();
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault();
              all[event.key === 'Home' ? 0 : all.length - 1]?.focus();
            } else if (event.key === 'Tab') {
              trigger.current?.focus();
              setOpen(false);
            }
          }}
        >
          {actions.map((action) => (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              key={action.id}
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
