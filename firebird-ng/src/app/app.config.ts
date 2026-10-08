import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideFirebird, withUrlAlias, withDefaultGeometry } from './firebird';
import { withFirebirdBuiltins } from './firebird/with-firebird-builtins';
import { withExampleCherenkov } from '@dexvis/firebird-example-extension';
import { withEpicDataCatalog } from './epic/epic-data-catalog';

// The app assembles Firebird through the same composition API an external
// experiment uses: provideFirebird(features). Built-in factories, painters,
// loaders and commands are an ordinary feature pack (withFirebirdBuiltins);
// the example extension lives outside firebird-ng entirely.
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideFirebird(
      withFirebirdBuiltins(),
      withUrlAlias('epic://', 'https://eic.github.io/epic/artifacts/'),
      // The same URL the ePIC catalog's full-detector entries use, so a fresh
      // install shows that preset as the active one
      withDefaultGeometry('https://seeeic.org/g/epic/artifacts/tgeo/epic_craterlake.root'),
      withEpicDataCatalog(),
      withExampleCherenkov(),
    ),
  ],
};
