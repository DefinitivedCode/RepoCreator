import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** A count badge, for example the number of items needing attention. */
  count?: number;
}

/**
 * The ARIA tab pattern: arrow keys, Home and End move and select; only the selected
 * tab is in the tab order (roving tabindex). Children render inside the tabpanel.
 */
export function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  children,
}: {
  label: string;
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  children?: ReactNode;
}) {
  const base = useId();
  const list = useRef<HTMLDivElement>(null);
  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = `${base}-panel`;
  function onKeyDown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = tabs.findIndex((tab) => tab.id === value);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    onChange(tabs[next].id);
    list.current?.querySelector<HTMLElement>(`[id="${tabId(tabs[next].id)}"]`)?.focus();
  }
  return (
    <div className="ui-tabs">
      <div className="ui-tabs-list" role="tablist" aria-label={label} ref={list}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            className="ui-tab"
            aria-selected={value === tab.id}
            aria-controls={panelId}
            tabIndex={value === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={onKeyDown}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ui-tab-count">
                {tab.count}
                <span className="ui-visually-hidden"> need attention</span>
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="ui-tabpanel" role="tabpanel" id={panelId} aria-labelledby={tabId(value)}>
        {children}
      </div>
    </div>
  );
}
