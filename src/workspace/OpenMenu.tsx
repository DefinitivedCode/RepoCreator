import { useEffect, useId, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '../icons';
import type { ProjectTool } from '../workspaceTypes';
import { message } from './shared';
import { toolState } from './Tools';
import './open-menu.css';

/**
 * Header "Open in…" popover: one click to launch an available tool. It lists only detected
 * tools and never starts anything until a tool is chosen. Everything else stays on the Open tab.
 */
export function OpenMenu({
  id,
  tools,
  disabled,
  onMore,
}: {
  id: string;
  tools: ProjectTool[];
  disabled: boolean;
  onMore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const available = tools.filter((tool) => toolState(tool) === 'available' && tool.available);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  async function launch(tool: string) {
    setPending(tool);
    try {
      await invoke('launch_project_tool', { id, tool });
      setError('');
      setOpen(false);
    } catch (value) {
      setError(message(value));
    } finally {
      setPending('');
    }
  }
  return (
    <div
      className="open-menu"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        Open in…
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div
          className="open-menu-panel"
          id={panelId}
          role="group"
          aria-label="Open this project in"
        >
          {available.length ? (
            available.map((tool) => (
              <button
                type="button"
                key={tool.id}
                disabled={!!pending}
                aria-busy={pending === tool.id}
                onClick={() => void launch(tool.id)}
              >
                {pending === tool.id ? 'Opening…' : tool.name}
              </button>
            ))
          ) : (
            <p className="help">No tools detected yet.</p>
          )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setOpen(false);
              onMore();
            }}
          >
            All tools and setup
          </button>
        </div>
      )}
    </div>
  );
}
