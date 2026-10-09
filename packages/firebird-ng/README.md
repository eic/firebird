# @dexvis/firebird-ng

The Angular library of the Firebird event display: `provideFirebird()` and
its `with*()` features, the display pages and `<firebird-display>`, the
display services, and the code of the geometry and ROOT file web workers.
An application (Firebird's own or an external experiment's) assembles its
event display by composing features:

```ts
// app.config.ts: provideFirebird() installs Firebird's built-ins first
provideFirebird(
  withUrlAlias('data://', 'https://my.host/data/'),

  // an experiment's contributions:
  withEventPiece(CherenkovRingPieceFactory),                // DEX type decoder (worker-safe, @dexvis/firebird-core)
  withPainter(CherenkovRingPainter, { forPieceType: 'example.CherenkovRing' }),
  withThreeExtension(HoverInfoExtension),                   // machinery hook (scene/frame/input)
  withGeometryLoader(IgesGeometryLoader),                   // teach Firebird a file format
  withCommandHandler(MyCommandHandler),                     // extend the command vocabulary
  withDefaultGeometry('data://detector.root'),              // sugar for withConfigDefaults({'geometry.selectedGeometry': ...})
  withDataCatalog({ entries: [...], facets: [...] }),       // datasets for the data selector (presets, physics tags)
  withDataSelectorTab({ id: 'campaigns', label: 'Campaigns', load: () => import('./campaigns-tab') }), // a selector tab
  withRootGeometryRules(() => import('./rules').then(m => m.rules)),  // pre-build TGeo edits and cut lists (data)
  withGeometryTheme({ id: 'my-colors', load: () => import('./theme').then(m => m.ruleSets) }),
  withGeometryPostProcessor({ id: 'my.mirrors', load: () => import('./mirrors').then(m => m.Mirrors) }),
  withCameraPreset({ name: 'home', position: [0, 7000, 0], target: [0, 0, 0] }),  // pins the start view
  withCollisionIntro(() => import('./intro').then(m => m.BeamsIntro)),
  withToolbarAction({ id: 'intro', icon: 'close_fullscreen', label: 'Intro', command: { type: 'animate-collision' } }),
  withoutFeatures('firebird.navigation-cube'),              // drop a built-in part by feature id
)
```

One contribution per `with*()` call. Packs compose with
`firebirdPack(id, ...)` (a replaceable, removable unit with an id) or
`firebirdFeatures(...)` (no id): an experiment pack is one function returning
a composed feature. See `@dexvis/firebird-epic` (`packages/epic/`, the ePIC
pack the flagship installs), `src/lib/with-firebird-builtins.ts` (the
built-ins as named sub-features, with their feature ids), and
`@dexvis/firebird-example-extension` for a complete out-of-tree example with
its own piece type and painter.

## Setting up an application

The 0.1.0 betas publish under the npm dist-tag `next`. Install the library
with its peers into an Angular 22 application:

```bash
npm install @dexvis/firebird-ng@next @dexvis/firebird-core@next @dexvis/app-features @dexvis/shell \
  @angular/material @angular/cdk @angular/aria @angular/forms @angular/router three jsroot
```

```ts
// app.config.ts
import { provideFirebird, withAppVersion, withWorkers } from '@dexvis/firebird-ng';
import { version } from '../../package.json';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideFirebird(
      withAppVersion(version),
      withWorkers({
        geometry: () => new Worker(new URL('./workers/geometry.worker', import.meta.url), { type: 'module' }),
        rootFile: () => new Worker(new URL('./workers/root-file.worker', import.meta.url), { type: 'module' }),
      }),
      withMyExperiment(),
    ),
  ],
};

// app.routes.ts: the pages load lazily from the display entry
import { firebirdRoutes } from '@dexvis/firebird-ng';

export const routes: Routes = [
  { path: '', redirectTo: '/display', pathMatch: 'full' },
  ...firebirdRoutes(),   // display, split-window, config
];
```

- **Workers.** The application owns the two worker entry modules, so that its
  build bundles them (a `new Worker(new URL(...))` inside a prebuilt library
  is not bundled). Each entry is one call: `runGeometryWorker(self)` from
  `@dexvis/firebird-ng/workers/geometry`, `runRootFileWorker(self)` from
  `@dexvis/firebird-ng/workers/root-file`. Without `withWorkers()`, ROOT
  geometry and in-browser ROOT conversion fail with a message naming it.
- **angular.json.** The geometry worker bundles jsroot's geometry painter,
  which can import node-only renderers: add
  `"externalDependencies": ["@resvg/resvg-js", "canvas"]` to the build
  options. jsroot and the display entry import CommonJS modules; to silence
  the build's CommonJS warnings, add
  `"allowedCommonJsDependencies": ["jszip", "@oneidentity/zstd-js", "tmp", "jsdom", "mathjax"]`.
- **index.html.** The toolbars use Material Icons ligatures: load the font,
  for example
  `<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">`.
  Without it the buttons show the icon names as text.
- **Server config.** At startup the application fetches
  `assets/config.jsonc`, the server tier of the config (see Configs).
  Without the file the defaults apply and the console shows one
  "Failed to load config" error; an empty object (`{}`) is a valid file.
- **Your own page.** `<firebird-display>` (from `@dexvis/firebird-ng/display`)
  is the canvas alone: it attaches the display to its element, follows the
  element's size, loads the configured geometry and events and runs the
  startup commands; `(attached)` tells when the scene exists.

## Entry points

| Import | Holds | Load |
|--------|-------|------|
| `@dexvis/firebird-ng` | `provideFirebird()`, the built-ins, `firebirdRoutes()`, and everything in `/api` | In the initial bundle: stays light |
| `@dexvis/firebird-ng/api` | Tokens, `with*()` features, ThreeExtension and render view contracts, config keys, the light services | Re-exported by the root; the display entry builds on it |
| `@dexvis/firebird-ng/display` | Pages, `<firebird-display>`, components, display services | Lazily only (routes, `import()`): pulls three.js and Material |
| `@dexvis/firebird-ng/workers/geometry`, `/workers/root-file` | The worker code and its messages | From the application's worker entry modules |
| `@dexvis/firebird-ng/geometry-palette` | Named colors for geometry themes | From lazily loaded theme rule sets |

The root reaches the display entry through dynamic imports only, and the
display entry imports `/api`: an entry may not import an entry that imports
it, so the contracts both need live in `/api`. Each worker has its own entry
because a worker bundle must hold only its own code: one shared entry made
the ROOT file worker carry jsroot's geometry painter (1.17 MB instead of
116 kB).

## Precedence

One rule for every registry: contributions keep registration order (the
`provideFirebird()` arguments, depth first, after the built-ins); a later
contribution with the id of an earlier one replaces it at the earlier one's
position; where one entry is picked among several, the earliest wins (the
first loader that claims a source, the first painter registered for a piece
type). The ids: feature ids, `DataLoaderMeta.id`, `CommandHandler.type`,
`EventPieceFactory.type`, `PainterMeta.id`, and the `id`/`name` of tabs,
themes, post-processors, camera presets and toolbar actions (`tokens.ts`).
Registries whose ids are only known at runtime apply `resolveRegistry()`
from `@dexvis/app-features`; read loaders through `injectEventLoaders()` /
`injectGeometryLoaders()`, which apply the id rule the raw tokens skip.

## What lives where

The composition mechanism is the generic `@dexvis/app-features` package
(`dexvis/app-features-ng/`): the feature type and `appFeatures()`
composition (`FirebirdFeature` and `firebirdFeatures()` are the same things
under Firebird names), `contributeValue()`/`contributeClass()`, the config
registry (`ConfigService`, `ConfigProperty`), server config loading
(`ServerConfigService`), the command bus and URL startup parsing, and the
generic features `withConfigDefaults`, `withCommandHandler`, `withUrlAlias`,
`withUrlShorthand` and `withoutFeatures`, feature identity
(`appFeaturePack()`, the `kind`/`id` of every feature) and
`resolveRegistry()`. `provideFirebird()` (`src/lib/provide-firebird.ts`) is
`provideAppFeatures()` plus the built-ins (`withFirebirdBuiltins()`, which
include Firebird's server config defaults from
`api/src/lib/services/server-config.ts` and its URL shorthands,
`withFirebirdUrlShorthands()`) and event piece factory registration.

This package keeps what is Firebird's:

- `api/src/lib/`: the event display tokens (`tokens.ts`) and their `with*()`
  functions (`firebird-features.ts`), the geometry pipeline seams
  (`geometry-pipeline.ts`), `ThreeExtension` (`three-extension.ts`), the
  render view contracts and layer constants (`views.ts`), the config keys,
  `BatchStatusService` (`window.firebird`), and the light services
  (`services/`: data catalog, data selection, URL resolution).
- `src/lib/`: `provideFirebird()`, the built-ins, the built-in loaders and
  command handlers, `firebirdRoutes()`.
- `display/src/lib/`: the services that run the display (`services/`), the
  components and pages, the navigation cube extension (`extensions/`).
- `workers/geometry/`, `workers/root-file/`: the worker code.
- `geometry-palette/`: named colors for geometry themes; a subpath of its own
  because everything the package root exports lands in the initial bundle.

The package root re-exports the generic parts, so extensions import
everything from `@dexvis/firebird-ng`.

## Painter or ThreeExtension?

If it turns **data** (event pieces, fields, geometry) into visuals, it is a
**painter** — time-aware, per-piece, config-driven. If it hooks the
**machinery** — scene lifecycle, frame loop, input, UI — it is a
**ThreeExtension**. Field lines visualizing a field map are a painter, not an
extension.

## ThreeExtension lifecycle

- `onSceneInit(ctx)` runs strictly AFTER the async renderer init resolved.
  Never touch the scene before it. Attach pointer listeners to a view's
  container (`ctx.mainView.container`), not to `ctx.canvas`: on multi-view
  pages the view containers sit above the canvas and receive the events (an
  `AbortController` is the documented cleanup idiom).
- `onFrame(ctx)` runs inside the render loop, on rendered frames. Keep it
  cheap: no allocation. One that throws is logged and not called again; the
  loop continues.
- `onEventLoaded(event)` fires once for every event that becomes the painted
  one: the first event of each load, and each switch to another event.
- `onDispose()` runs once at application teardown — remove listeners and
  objects. Leaving a display page does not call it: the scene and the
  extensions outlive pages, and the loop only stops until the next display
  page attaches.
- Heavy extensions register with `withLazyThreeExtension(() => import(...))` —
  they load in their own chunk after the scene is up, and receive the
  `onSceneInit` call they missed.

## Render views and overlays

The scene renders through **render views** (`ctx.views`, `ctx.mainView` on
`SceneContext`; the `RenderView` interface). `ThreeService` keeps the one
Scene and the one render loop; each view owns its DOM container, cameras,
OrbitControls, picking and viewport rectangle inside the shared canvas. The
main display is `views[0]`; the quad-projection page adds three orthographic
views over the same scene.

- **Add a view**: `ctx.addView({ name, container, orthographic,
  fixedDirection })`: the container must sit above the shared canvas (see
  `display/src/lib/pages/split-window` for the reference layout). Remove it
  with `ctx.removeView(view)` when your page or panel goes away.
- **A view with its own geometry cut** (experimental): create the slice with
  `ctx.createGeometrySlice()` and pass `geometrySlice` and `clipPlane` to
  `addView`; the view then renders the slice copy (its camera gets
  `GEOMETRY_SLICE_LAYER`). Edits to the original geometry reach the copy
  only through `ctx.rebuildGeometrySlice()`.
- **Draw on top of a view**: `view.addOverlay({ render, onViewResize,
  onViewContainerChange, dispose })`. `render(view)` runs every frame after
  the view's scene render; set your own viewport/scissor from
  `view.viewportRect` and restore what you change. The navigation cube
  (`display/src/lib/extensions/viewport-gizmo.extension.ts`) is the built-in
  consumer of this seam.
- **Add objects to the event data**: `ctx.addEventObject(object)` puts them
  under `sceneEvent` on `EVENT_DATA_LAYER`, so every view draws them and
  tracks-on-top views draw them over the geometry. The layer constants
  (`GEOMETRY_MAIN_LAYER`, `GEOMETRY_SLICE_LAYER`, `EVENT_DATA_LAYER`) are
  exported.
- Cameras and `camera.up` handling are per view. When you change a view's up
  vector, use `view.setCameraUp()`: OrbitControls captures the up axis at
  construction and must be resynced.

## Rendering rules (read before writing onFrame)

1. **No per-frame polling as change propagation.** State changes travel
   through signals and effects; `onFrame` is for animation only. The loop
   renders ON DEMAND by default (config `rendering.mode`), so code that
   polls app state every frame does not merely waste cycles — it never runs
   while the display is idle.
2. **Changed something renderable? Call `ctx.invalidate()`.** The next
   animation frame renders. Without it, your mutation appears only when
   something else triggers a render. For an animation: seed one
   `invalidate()` when it starts and call it again from every update — the
   chain ends by itself when the animation stops updating. `onFrame` runs
   only on frames that render; its `deltaTime` is the time since the
   previous rendered frame.
3. **The render loop lives in exactly one place** (`ThreeService.renderLoop`).
   Do not start your own rAF chain against the same scene; use `onFrame`.

## Bundle discipline

Anything referenced from `app.config.ts` lands in the initial bundle. Painter
classes pull three.js material code: register built-in-style painters with
`withLazyPainter(type, () => import(...))`. Loaders and command handlers that
need display services load `@dexvis/firebird-ng/display` with a dynamic
`import()` inside the method that needs them (see `src/lib/builtin-loaders.ts`
for the pattern). A pack may inject `EventDisplayService`, `DataModelService`
and `SelectionService` from the display entry that way, or statically in its
own lazily loaded code.

## Loaders

A loader returns data; the display shows it.

- `canLoad(source)` claims a source by its name (extension, scheme); the
  first registered loader that claims it loads it. A `.root` file is
  ambiguous (geometry or events): the data selector probes it and asks
  `canLoadContent(probe)` to pick the field, geometry or events.
- `load(source, context)` (geometry) resolves to the geometry root, in the
  loader's `millimetersPerUnit` (default 1; ROOT TGeo: 10, centimeters).
  `loadEvents(source, context)` (events) resolves to a `DataExchange`.
- `context.resolveUrl(url)` turns aliases (`asset://`, a pack's alias) and
  server paths into a URL `fetch()` reads. `context.signal` aborts when a
  newer load of the same kind starts: stop and reject with its reason.
- Reject with an `Error` whose message says what went wrong (HTTP status,
  unsupported version): the display shows it to the user and lists it in
  `window.firebird.errors`.

`EventDisplayService.openGeometry(source)` and `openEvents(source)` run this
for every source: the config keys, picked files, the data selector, the
`open-geometry`/`open-dex` commands. They resolve to null when a newer load
replaced theirs.

## Configs

Declare configs through `ConfigService.declare({ key, default, label, ... })`.
Every declared key obeys the source precedence
`defaults < server(config.jsonc) < localStorage < URL (?config.key=value) < runtime`,
where URL values win for the session without being persisted. Read typed
server config fields through `ServerConfigService<ServerConfig>`
(`inject<ServerConfigService<ServerConfig>>(ServerConfigService)`).

- Declare each key from ONE exported schema object and import it wherever
  the key is read or written. The first declaration decides the default and
  the validator; in development builds a later declaration with a different
  default or validator logs a `[ConfigService]` warning. Firebird's own keys
  live in `config-keys.ts` (`ROOT_EVENT_RANGE_CONFIG`, `GEOMETRY_URL_CONFIG`,
  ...), exported from this package.
- Give URL-valued keys the `isPersistableUrl` validator: it rejects `blob:`
  and `data:` URLs from every source, including values an older build saved.
- A reset (`property.setDefault()`) removes the saved value and the URL
  override; the value falls back to the server value or the default.

## Painter metadata and knobs

A painter declares itself with `static meta: PainterMeta`:

```ts
export class TrajectoryPainter extends EventPiecePainter {
  static meta: PainterMeta = {
    id: 'trajectory-lines',
    forPieceTypes: ['PointTrajectory'],
    label: 'Trajectory lines',
    configs: [
      { key: 'colorMode', default: 'pid', options: ['pid', 'momentum', 'solid'], label: 'Coloring' },
      { key: 'lineWidth', default: 30, min: 1, max: 300, label: 'Line width [mm]' },
    ],
  };
}
```

- **Selection**: several painters may register for one piece type; the config
  key `painters.byPiece.<pieceName>` picks which one paints each piece: from
  the panel, a yaml file, or a URL. The default is the first painter in
  registration order, whatever order lazy painter chunks load in.
- **Knobs** live under `painters.byPiece.<pieceName>.<key>` with normal config
  precedence. The right-pane painter panel auto-renders them from the meta —
  no per-painter UI code. The knob names `visible` and `time` are reserved
  (`RESERVED_PAINTER_KNOB_KEYS`); registering a painter that declares one
  throws.
- The instance reads knobs through `this.config` (a `PainterConfigView`) and
  restyles existing objects in `onConfigChanged()` — knob changes must apply
  live, never require a rebuild. Without a config system (workers, scripts)
  the declared defaults apply; painter code stays DI-free.

## Selection

Painters register their scene objects per entity as they build
(`registerEntityObject(index, object)`), which powers `SelectionService`:
a 3D click resolves the picked object back to `(pieceName, entityIndex)`,
and a model-tree click resolves the entity to its objects for highlighting
(`highlightEntity`/`unhighlightEntity`). Pieces describe their entities to
the model tree via `entityCount`, `entityLabel(i)` and `entityRefs(i)` —
override them in custom piece types to get meaningful labels and navigable
reference links for free.

## Commands

Serializable commands drive the display from URLs, server config and batch:
`?dex=<url>&event=2`, `?cmd=type:arg;type:arg`, config.jsonc
`startupCommands`, `pyrobird screenshot --commands "..."`. Add your own with
`withCommandHandler` — implement `type`, `execute(cmd)`, and optionally
`fromUrlArg(arg)` for the URL grammar. A URL shorthand
(`withUrlShorthand('dex', 'open-dex')`) is an alias for `?cmd=<type>:<value>`,
so `fromUrlArg` builds the shorthand's command too. Batch tools await
`window.firebird.ready` (geometry loaded, startup commands done).
