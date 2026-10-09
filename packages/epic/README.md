# @dexvis/firebird-epic

The ePIC experiment pack for the [Firebird](https://github.com/eic/firebird)
event display: everything Firebird knows about the ePIC detector at the
Electron-Ion Collider, installed with one call.

```ts
import { provideFirebird } from '@dexvis/firebird-ng';
import { withEpic } from '@dexvis/firebird-epic';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFirebird(withEpic({ geometry: 'epic://tgeo/epic_craterlake.root' })),
  ],
};
```

`withEpic()` contributes:

- the `epic://` URL alias for https://seeeic.org/g/epic/artifacts/
- the ePIC datasets of the data selector (presets, physics facets, URL lists)
- TGeo cleanup rules (`default`) and the `central` cut list, posted to the
  geometry worker as data
- the `cool2`, `cool2no` and `cad` geometry themes
- the Cherenkov collections (`DIRCBarHits`, `DRICHHits`, `PFRICHHits`) that
  the browser conversion keeps out of MC-truth trajectories
  (`events.trajectoryExcludedCollections`)
- geometry post-processors: reflective dRICH mirrors and the
  Forward/Central/Backward detector grouping
- the camera views `home`, `center` and `farforward`, and orbit limits for the
  ePIC hall
- the beam collision intro and its toolbar button

## Options are defaults

Each option sets a config default, the lowest precedence tier. Server
config.jsonc, a value saved on the config page, and a `?config.<key>=` URL
value override it.

| Option     | Config key                  | Default |
|------------|-----------------------------|---------|
| `geometry` | `geometry.selectedGeometry` | `https://seeeic.org/g/epic/artifacts/tgeo/epic_craterlake.root` |

The pack has the feature id `epic`: installed twice, it takes effect once, and
`withoutFeatures('epic')` removes all of it.

## Build and tests

The pack is an Angular library: ng-packagr builds it into `dist/`, against
the built `@dexvis/firebird-ng`, so the library and its dependencies build
first. The package publishes from `dist/`. From the repository root:

```bash
for w in root-geo-tree-editor threejs-tree-editor viewport-gizmo root2dex firebird-core app-features; do
  npm run build -w @dexvis/$w
done
(cd dexvis/app-shell-ng && npx ng build app-shell)
npm run build -w @dexvis/firebird-ng
npm run build -w @dexvis/firebird-epic
npm test -w @dexvis/firebird-epic
```
