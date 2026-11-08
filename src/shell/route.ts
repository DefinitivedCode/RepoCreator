import type { Page } from './Sidebar';

export type SettingsTarget = 'git' | 'github';

/** Where the application is. No router: this is plain state owned by the shell. */
export interface Route {
  page: Page;
  /** The project selected in the library, kept while moving between pages. */
  projectId?: string;
  /** A Settings tab to open directly (from a blocker's fix). */
  tab?: SettingsTarget;
}

export type RouteAction =
  | { type: 'go'; page: Page }
  | { type: 'settings'; tab?: SettingsTarget }
  | { type: 'select-project'; id?: string }
  | { type: 'open-project'; id: string };

export const initialRoute: Route = { page: 'new' };

export function routeReducer(route: Route, action: RouteAction): Route {
  switch (action.type) {
    case 'go':
      // A normal destination never carries a stale Settings tab.
      return { page: action.page, projectId: route.projectId };
    case 'settings':
      return { page: 'settings', projectId: route.projectId, tab: action.tab };
    case 'select-project':
      return { ...route, projectId: action.id };
    case 'open-project':
      return { page: 'projects', projectId: action.id };
  }
}
