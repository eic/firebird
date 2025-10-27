import { Routes } from '@angular/router';
import {InputConfigComponent} from "./pages/input-config/input-config.component";

export const routes: Routes = [
  { path: '', redirectTo: '/display', pathMatch: 'full' },
  { path: 'config', component: InputConfigComponent },
  {
    path: 'display',
    loadComponent: () => import('./pages/main-display/main-display.component').then(m => m.MainDisplayComponent)
  },
  {
    path: 'playground',
    loadComponent: () => import('./pages/playground/playground.component').then(m => m.PlaygroundComponent)
  },
  {
    path: 'help',
    loadComponent: () => import('./pages/help/help.component').then(m => m.HelpComponent)
  },
  {
    path: 'help/:page',
    loadComponent: () => import('./pages/help/help.component').then(m => m.HelpComponent)
  },
  {
    path: 'geometry',
    loadComponent: () => import('./components/scene-tree/scene-tree.component').then(m => m.SceneTreeComponent)
  },
  {
    path: 'shell',
    loadComponent: () => import('./pages/shell-example/shell-example.component').then(m => m.ShellExampleComponent)
  },
  {
    path: 'split-window',
    loadComponent: () => import('./pages/split-window/split-window.component').then(m => m.SplitWindowComponent)
  },
];
