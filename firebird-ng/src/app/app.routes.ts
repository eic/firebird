import { Routes } from '@angular/router';
import {MainDisplayComponent} from "./main-display/main-display.component";
import {FileBrowserComponent} from "./file-browser/file-browser.component";
import {InputConfigComponent} from "./input-config/input-config.component";
import {Edm4hepListingComponent} from "./edm4hep-listing/edm4hep-listing.component";

export const routes: Routes = [
  { path: '', redirectTo: '/display', pathMatch: 'full' },
  { path: 'config', component: InputConfigComponent },
  {
    path: 'files',
    loadComponent: () => import('./file-browser/file-browser.component').then(m => m.FileBrowserComponent)
  },
  {
    path: 'display',
    loadComponent: () => import('./main-display/main-display.component').then(m => m.MainDisplayComponent)
  },
  {
    path: 'playground',
    loadComponent: () => import('./playground/playground.component').then(m => m.PlaygroundComponent)
  },
  {
    path: 'geometry',
    loadComponent: () => import('./geometry-tree/geometry-tree.component').then(m => m.GeometryTreeComponent)
  },
  {
    path: 'listing',
    loadComponent: () => import('./edm4hep-listing/edm4hep-listing.component').then(m => m.Edm4hepListingComponent)
  },
];
