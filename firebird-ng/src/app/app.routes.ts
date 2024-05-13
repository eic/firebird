import { Routes } from '@angular/router';
import {MainDisplayComponent} from "./main-display/main-display.component";
import {FileBrowserComponent} from "./file-browser/file-browser.component";

export const routes: Routes = [
  {
    path: 'display',
    loadComponent: () => import('./main-display/main-display.component').then(m => m.MainDisplayComponent)
  },
  { path: '', component: FileBrowserComponent }

];
