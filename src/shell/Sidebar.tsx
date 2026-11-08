import { Icon, type IconName } from '../icons';
import '../ui/ui.css';

export type Page = 'new' | 'projects' | 'presets' | 'settings';

const destinations: { id: Page; name: string; icon: IconName }[] = [
  { id: 'new', name: 'New Project', icon: 'plus' },
  { id: 'projects', name: 'Projects', icon: 'folder' },
  { id: 'presets', name: 'Presets', icon: 'repo' },
];

/**
 * The single application navigation. Below 900px wide it collapses to an icon rail:
 * labels are visually hidden but remain the accessible names, with a tooltip.
 */
export function Sidebar({
  version,
  page,
  disabled,
  setupNeedsAttention,
  updateAvailable,
  onNavigate,
  onReviewUpdate,
}: {
  version?: string;
  page: Page;
  /** Navigation is locked while a project is being created. */
  disabled: boolean;
  setupNeedsAttention: boolean;
  updateAvailable: boolean;
  onNavigate: (page: Page) => void;
  onReviewUpdate: () => void;
}) {
  const item = (id: Page, name: string, icon: IconName, dot = false) => (
    <button
      key={id}
      type="button"
      className="sidebar-item"
      data-primary={id === 'new' || undefined}
      aria-current={page === id ? 'page' : undefined}
      aria-describedby={dot ? 'sidebar-setup-note' : undefined}
      title={name}
      disabled={disabled}
      onClick={() => onNavigate(id)}
    >
      <Icon name={icon} size={16} />
      <span className="sidebar-label">{name}</span>
      {dot && <span className="sidebar-dot" aria-hidden="true" />}
    </button>
  );
  return (
    <aside className="app-sidebar" aria-label="Application">
      <div className="app-title">
        <span className="brand-mark" aria-hidden="true" />
        <h1 className="sidebar-label">Repo Creator</h1>
        {version && <span className="version sidebar-label">{version}</span>}
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {destinations.map(({ id, name, icon }) => item(id, name, icon))}
        <div className="sidebar-spacer" />
        {updateAvailable && (
          <button
            type="button"
            className="sidebar-item"
            title="Update available"
            onClick={onReviewUpdate}
          >
            <Icon name="refresh" size={16} />
            <span className="sidebar-label">Update available</span>
          </button>
        )}
        {item('settings', 'Settings', 'settings', setupNeedsAttention)}
        {setupNeedsAttention && (
          <span id="sidebar-setup-note" className="ui-visually-hidden">
            Setup needs attention
          </span>
        )}
      </nav>
    </aside>
  );
}
