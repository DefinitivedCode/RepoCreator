import { describe, expect, it } from 'vitest';
import { initialRoute, routeReducer, type Route } from './route';

describe('route reducer', () => {
  it('starts on New Project', () => {
    expect(initialRoute).toEqual({ page: 'new' });
  });

  it('opens a Settings tab directly and forgets it on the next ordinary navigation', () => {
    let route: Route = routeReducer(initialRoute, { type: 'settings', tab: 'github' });
    expect(route).toEqual({ page: 'settings', projectId: undefined, tab: 'github' });
    route = routeReducer(route, { type: 'go', page: 'projects' });
    expect(route.tab).toBeUndefined();
    route = routeReducer(route, { type: 'go', page: 'settings' });
    expect(route).toMatchObject({ page: 'settings' });
    expect(route.tab).toBeUndefined();
  });

  it('keeps the selected project while moving between pages', () => {
    let route = routeReducer(initialRoute, { type: 'select-project', id: 'river' });
    route = routeReducer(route, { type: 'go', page: 'presets' });
    route = routeReducer(route, { type: 'go', page: 'projects' });
    expect(route.projectId).toBe('river');
    route = routeReducer(route, { type: 'settings' });
    expect(route.projectId).toBe('river');
  });

  it('opens a created project in the library', () => {
    const route = routeReducer({ page: 'new' }, { type: 'open-project', id: 'fresh' });
    expect(route).toEqual({ page: 'projects', projectId: 'fresh' });
  });

  it('never mutates the previous route', () => {
    const before: Route = Object.freeze({ page: 'new' });
    routeReducer(before, { type: 'go', page: 'settings' });
    expect(before).toEqual({ page: 'new' });
  });
});
