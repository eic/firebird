import { Routes } from '@angular/router';
import { firebirdRoutes } from '@dexvis/firebird-ng';

// Every route loads lazily: the display entry of @dexvis/firebird-ng pulls
// three.js and Angular Material, and a static import here would put them
// into the initial bundle.
export const routes: Routes = [
  { path: '', redirectTo: '/display', pathMatch: 'full' },
  // display, split-window, config
  ...firebirdRoutes(),
  {
    path: 'geometry',
    loadComponent: () => import('@dexvis/firebird-ng/display').then(m => m.SceneTreeComponent)
  },
  // Developer pages of the flagship
  {
    path: 'playground',
    loadComponent: () => import('./pages/playground/playground.component').then(m => m.PlaygroundComponent)
  },
  {
    path: 'shell',
    loadComponent: () => import('./pages/shell-example/shell-example.component').then(m => m.ShellExampleComponent)
  },
  {
    path: 'palette',
    loadComponent: () => import('./pages/palette/palette.component').then(m => m.PaletteComponent)
  },
];
