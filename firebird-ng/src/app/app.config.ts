import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideFirebird, withAppVersion, withWorkers } from '@dexvis/firebird-ng';
import { withEpic } from '@dexvis/firebird-epic';
import { withExampleCherenkov } from '@dexvis/firebird-example-extension';
// A named import: the bundler keeps only this field of the manifest
import { version } from '../../package.json';

// The app assembles Firebird through the same composition API an external
// experiment uses: provideFirebird() installs Firebird's built-ins, and the
// ePIC pack and the example extension are ordinary packs on top of them.
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideFirebird(
      withAppVersion(version),
      // The worker entry modules live in the app so that its build bundles them
      withWorkers({
        geometry: () => new Worker(new URL('./workers/geometry.worker', import.meta.url), { type: 'module' }),
        rootFile: () => new Worker(new URL('./workers/root-file.worker', import.meta.url), { type: 'module' }),
      }),
      withEpic({ geometry: 'https://seeeic.org/g/epic/artifacts/tgeo/epic_craterlake.root' }),
      withExampleCherenkov(),
    ),
  ],
};
