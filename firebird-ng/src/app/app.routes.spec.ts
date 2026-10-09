import { routes } from './app.routes';

// The initial bundle rule: a route component imported statically would put
// its page, and through the display pages three.js, into the initial bundle.
describe('app routes', () => {
  it('load every page lazily', () => {
    for (const route of routes) {
      if (route.redirectTo !== undefined) continue;
      expect(route.component, `route '${route.path}'`).toBeUndefined();
      expect(route.loadComponent, `route '${route.path}'`).toBeTypeOf('function');
    }
  });

  it("include Firebird's pages and the flagship's developer pages", () => {
    expect(routes.map(route => route.path)).toEqual(
      ['', 'display', 'split-window', 'config', 'geometry', 'playground', 'shell', 'palette']);
  });
});
