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
    path: 'geometry',
    loadComponent: () => import('./pages/geometry-tree/geometry-tree.component').then(m => m.GeometryTreeComponent)
  },
  {
    path: 'split-window',
    loadComponent: () => import('./pages/split-window/split-window.component').then(m => m.SplitWindowComponent)
  },
];
