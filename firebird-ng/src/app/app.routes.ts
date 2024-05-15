import { Routes } from '@angular/router';
import {MainDisplayComponent} from "./main-display/main-display.component";
import {FileBrowserComponent} from "./file-browser/file-browser.component";
import {InputConfigComponent} from "./input-config/input-config.component";

export const routes: Routes = [
  { path: '', redirectTo: '/config', pathMatch: 'full' },
  { path: 'config', component: InputConfigComponent },
  {
    path: 'display',
    loadComponent: () => import('./main-display/main-display.component').then(m => m.MainDisplayComponent)
  },
  {
    path: 'files',
    loadComponent: () => import('./file-browser/file-browser.component').then(m => m.FileBrowserComponent)
  },
];
