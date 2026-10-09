import type { Routes } from '@angular/router';

/**
 * The routes of Firebird's pages, each loaded lazily from the display entry:
 * `display` (the event display), `split-window` (the quad projection view)
 * and `config` (data and pipeline settings). The display chrome's navigation
 * links to `/display` and `/config`.
 *
 * ```ts
 * provideRouter([
 *   { path: '', redirectTo: '/display', pathMatch: 'full' },
 *   ...firebirdRoutes(),
 * ])
 * ```
 */
export function firebirdRoutes(): Routes {
  return [
    {
      path: 'display',
      loadComponent: () => import('@dexvis/firebird-ng/display').then(m => m.MainDisplayComponent),
    },
    {
      path: 'split-window',
      loadComponent: () => import('@dexvis/firebird-ng/display').then(m => m.SplitWindowComponent),
    },
    {
      path: 'config',
      loadComponent: () => import('@dexvis/firebird-ng/display').then(m => m.InputConfigComponent),
    },
  ];
}
