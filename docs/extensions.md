# Extension System

Firebird is assembled from features: an application declares what it wants —
data types, painters, loaders, commands, settings — and the framework collects
the contributions through Angular dependency injection. Firebird's own
built-ins register through the same API, so anything a built-in can do, your
extension can do.

The working template is the `packages/firebird-example-extension` package in
the repository: a custom event data type (Cherenkov rings) and its painter
with a configurable ring color, installable with one line.

> **Note:** Earlier versions used the `@firebird/` scope; replace `@firebird/ng`, `@firebird/core`, `@firebird/root2dex` and `@firebird/example-extension` with `@dexvis/firebird-ng`, `@dexvis/firebird-core`, `@dexvis/root2dex` and `@dexvis/firebird-example-extension`.

## Composing an application

```ts
// app.config.ts
import { provideFirebird, withAppVersion, withWorkers } from '@dexvis/firebird-ng';
import { withExampleCherenkov } from '@dexvis/firebird-example-extension';
import { withMyExperiment } from './my-experiment';
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
      withExampleCherenkov(),
    ),
  ],
};

// app.routes.ts: Firebird's pages, each loaded lazily
import { firebirdRoutes } from '@dexvis/firebird-ng';

export const routes: Routes = [
  { path: '', redirectTo: '/display', pathMatch: 'full' },
  ...firebirdRoutes(),   // display, split-window, config
];
```

The two worker entry modules belong to the application, so that its build
bundles them; each is one call:

```ts
// workers/geometry.worker.ts
import { runGeometryWorker } from '@dexvis/firebird-ng/workers/geometry';
runGeometryWorker(self);

// workers/root-file.worker.ts
import { runRootFileWorker } from '@dexvis/firebird-ng/workers/root-file';
runRootFileWorker(self);
```

The geometry worker bundles jsroot's geometry code, which can import
node-only renderers: add `"externalDependencies": ["@resvg/resvg-js",
"canvas"]` to the build options in `angular.json`.

The pages, `<firebird-display>` and the display services come from
`@dexvis/firebird-ng/display`, which pulls three.js and Angular Material:
reach it through routes or `import()` only. To build a page of your own, put
`<firebird-display (attached)="onAttached()">` where the canvas belongs: it
attaches the display to its element, follows the element's size, loads the
configured geometry and events, and runs the startup commands; `(attached)`
fires once the scene exists.

`provideFirebird()` installs Firebird's built-ins (data types, painters,
loaders, commands, camera views, the navigation cube, the data selector tabs)
before your features. One contribution per `with*()` call. To ship several
contributions as one installable package (an "experiment pack"), compose them
into a pack with an id:

```ts
export function withMyExperiment(): FirebirdFeature {
  return firebirdPack('my-experiment',
    withEventPiece(MyDataFactory),
    withLazyPainter('my.DataType', () => import('./my.painter').then(m => m.MyPainter)),
    withDefaultGeometry('https://my.host/detector.root'),
  );
}
```

The pack id makes the pack replaceable and removable, a pack installed twice
is installed once, and development builds name the pack in collision
warnings. `firebirdFeatures(...)` composes features without an id.

The flagship app is `provideFirebird(withEpic({...}), withExampleCherenkov())`:
everything Firebird knows about the ePIC detector sits in one pack,
`@dexvis/firebird-epic` (`packages/epic/`), built from the functions on this
page. Its options are config defaults: `withEpic({ geometry: url })` sets the
default geometry, and server config, a value saved on the config page, and a
`?config.` URL value override it.

## Identity, precedence and opting out

Every registry follows one rule. Contributions keep registration order: the
order of the `provideFirebird()` arguments, depth first, after the
built-ins. A later contribution with the id of an earlier one replaces it at
the earlier one's position. Where one entry is picked among several, the
earliest wins: the first loader whose `canLoad()` accepts a source loads it,
and the first painter registered for a piece type is its default. The ids:

| Registry | Id |
|----------|----|
| Features (`with*()` calls, packs) | the feature id: `firebirdPack(id, ...)`, or derived, for example `url-alias:epic://`, `data-selector-tab:manual`, `camera-preset:home` |
| Event and geometry loaders | `DataLoaderMeta.id` |
| Command handlers | `CommandHandler.type` |
| Piece factories | `EventPieceFactory.type` |
| Painters of one piece type | `PainterMeta.id` |
| Data selector tabs, themes, post-processors, toolbar actions | their `id` |
| Camera presets | their `name` |

To take over a built-in, register under its id. To drop one, pass
`withoutFeatures()` with its feature id:

```ts
provideFirebird(
  withMyExperiment(),
  withoutFeatures('firebird.navigation-cube', 'data-selector-tab:physics'),
)
```

The built-ins are named sub-features, each exported for reuse:

| Sub-feature | Feature id | Contributes |
|-------------|------------|-------------|
| `withServerConfig()` from `@dexvis/app-features` | `server-config` | The server config URL and Firebird's defaults under it |
| `withFirebirdUrlShorthands()` | `firebird.url-shorthands` | The `?geometry=`, `?dex=` and `?event=` deep-link shorthands |
| `withBoxHits()` | `firebird.box-hits` | BoxHit decoder and painter |
| `withTrajectories()` | `firebird.trajectories` | PointTrajectory decoder and painters |
| `withDexEvents()` | `firebird.dex-events` | DEX `.firebird.json`/`.zip` loader |
| `withRootEventsInBrowser()` | `firebird.root-events-in-browser` | EDM4eic/EDM4hep ROOT conversion in the browser |
| `withServerConversion()` | `firebird.server-conversion` | ROOT conversion through pyrobird (XRootD) |
| `withRootGeometry()` | `firebird.root-geometry` | TGeo geometry loader, the `grey` theme |
| `withFirebirdCommands()` | `firebird.commands` | The command vocabulary |
| `withStandardCameraPresets()` | `firebird.camera-presets` | Face views and `home` |
| `withNavigationCube()` | `firebird.navigation-cube` | The camera navigation cube |
| `withDataSelectorTabs()` | `firebird.data-selector-tabs` | Presets, Physics and Manual tabs |

The whole built-in pack is `firebird.builtins`. Replacing one of its parts by
id is the intended customization and draws no warning. Dropping a pack
(`withoutFeatures('my-experiment')`) drops everything it contributes,
including its replacements of built-in parts: the built-in versions take
effect again. Development builds warn when two of your packs contribute the
same feature id with different content (for example one URL alias prefix
with two bases), or ship factories for one piece type.

## The feature functions

| Function | Registers | Notes |
|----------|-----------|-------|
| `withEventPiece(FactoryClass)` | A decoder that turns a DEX piece of your `type` into a model object | The model class is plain TypeScript (worker-safe, no Angular) |
| `withPainter(PainterClass, {forPieceType})` | A painter: turns model data into three.js objects | Eager — lands in the initial bundle |
| `withLazyPainter(type, () => import(...))` | Same, loaded on demand | Preferred: painter code pulls three.js material code |
| `withThreeExtension(ExtClass)` | A rendering-machinery hook (see lifecycle below) | Instantiated through DI; `inject()` works in the constructor |
| `withLazyThreeExtension(() => import(...))` | Same, loaded after the scene is up, in its own chunk | For heavy extensions (VR, big overlays) |
| `withGeometryLoader(LoaderClass)` | A geometry file-format/URL-scheme loader | First loader whose `canLoad()` accepts the source wins; see [Loaders](#loaders) |
| `withEventLoader(LoaderClass)` | An event data loader | Same selection rule. `matchesFileExtensions()` claims by `meta.fileExtensions`; a `meta.urlSchemes` entry claims only names with no file extension, so `asset://data/run.root` still reaches the `.root` loader |
| `withWorkers({geometry, rootFile})` | The factories that start Firebird's two web workers from the application's entry modules | Required for ROOT geometry and in-browser ROOT conversion |
| `withAppVersion(version)` | The application version the logo menu shows | |
| `withRootGeometryRules(rules)` | Pre-build TGeo edit rule sets and cut lists | Plain data posted to the geometry worker; see [Geometry pipeline](#geometry-pipeline) |
| `withGeometryTheme({id, label, load})` | A geometry theme selected by `geometry.themeName` | `load` is a dynamic import of the rule sets |
| `withGeometryPostProcessor({id, after, load})` | Main-thread code run after each geometry load | May be async; ordered by `after` |
| `withCameraPreset(preset)` | A named camera view for `camera-preset:<name>`, the cube's home button and the camera panel | Register `home` to pin the start view |
| `withCameraLimits({minDistance, maxDistance})` | Fixed orbit distance limits [mm] | Without it, each geometry load derives them |
| `withCollisionIntro(() => import(...))` | The animation played before an event's time animation | One per application |
| `withToolbarAction({id, icon, label, command})` | A button in the time toolbar that dispatches a command | |
| `withCommandHandler(HandlerClass)` | A command type on the [command bus](/command-bus) | Works from URL, server, and batch immediately |
| `withUrlAlias(prefix, base)` | A URL scheme alias, e.g. `epic://` | |
| `withConfigDefaults({key: value})` | Setting defaults (lowest priority tier) | A pack configures, never locks — every other source overrides |
| `withDefaultGeometry(url)` | The detector geometry loaded when nothing else selects one | Sugar for `withConfigDefaults({'geometry.selectedGeometry': url})` |
| `withDataCatalog({entries, facets, ...})` | Datasets the data selector offers: presets, physics tags, URL lists | Several contributions merge; see below |
| `withDataSelectorTab({id, label, load})` | A tab of the data selector control | `load` is a dynamic import; the component reads and writes `DataSelectionService.draft` |
| `withUrlShorthand(param, commandType)` | A URL query shorthand: `?param=X` runs what `?cmd=commandType:X` runs | Firebird's own `dex`, `geometry` and `event` are shorthands |

`withCommandHandler`, `withUrlAlias`, `withConfigDefaults`,
`withUrlShorthand` and `withoutFeatures` come from the generic
[`@dexvis/app-features`](https://github.com/dexvis/app-features-ng) package,
together with the feature type (`FirebirdFeature` is its `AppFeature`), the
config registry and the command bus. `@dexvis/firebird-ng` re-exports them;
import everything from `@dexvis/firebird-ng`.

## Painter or ThreeExtension?

If the code turns **data** (event pieces, field maps, geometry) into visuals,
it is a **painter** — time-aware, per-piece, selected by the data's type.
If it hooks the **machinery** — scene lifecycle, frame loop, input, UI — it is
a **ThreeExtension**. Magnetic field lines that visualize a field map are a
painter; a hover-probe that raycasts under the mouse is an extension.

A built-in example to read: the camera navigation cube
(`packages/firebird-ng/display/src/lib/extensions/viewport-gizmo.extension.ts`) binds the
`@dexvis/viewport-gizmo` package to the scene, controls, frame loop and
command bus, and is registered with `withLazyThreeExtension` inside
`withNavigationCube()`.

## ThreeExtension lifecycle

```ts
@Injectable()
export class HoverInfoExtension implements ThreeExtension {
  onSceneInit(ctx: SceneContext): void {
    // scene, cameras, renderer, views are ready; listen for pointer input
    // on ctx.mainView.container (not ctx.canvas)
  }
  onFrame(ctx: FrameContext): void {
    // every rendered frame, before rendering; keep cheap, no allocation
  }
  onEventLoaded(event: Event): void {}
  onDispose(): void {
    // once, at application teardown; remove listeners and objects
  }
}
```

- `onSceneInit` fires strictly AFTER the renderer's async initialization —
  extensions never see a half-initialized scene, and never need "defer until
  ready" logic of their own.
- `onEventLoaded` fires once for every event that becomes the painted one:
  the first event of each load, and each switch to another event. It runs
  after the event is painted.
- Rendering rules: state changes travel through signals/effects — never poll
  application state inside `onFrame`. After mutating anything renderable, call
  `ctx.invalidate()` — the next animation frame renders. The render loop is
  on-demand by default (config key `rendering.mode`, values `on-demand` and
  `continuous`): a mutation without an `invalidate()` appears only when
  something else triggers a render.
- `onFrame` runs only on frames that render. An animation sustains itself by
  calling `invalidate()` from its own update — start it with one seed
  `invalidate()`, and the chain ends when the animation stops updating.
  `deltaTime` is the time since the previous rendered frame.
- Do not start your own requestAnimationFrame chain against the scene; use
  `onFrame`.
- Hooks are isolated: an `onFrame` that throws is logged and not called
  again, and the render loop and the other extensions continue. An
  exception from `onSceneInit`, `onEventLoaded` or `onDispose` is logged.
- Lifetime: the scene and the extensions are application-scoped. Leaving
  `/display` stops the render loop and keeps the scene; returning re-attaches
  the canvas and does not call `onSceneInit` again. `onDispose` runs once,
  at application teardown.
- Pointer input: listen on a view's `container` (`ctx.mainView.container`),
  not on `ctx.canvas`. On multi-view pages the view containers sit above the
  shared canvas, so the canvas receives no pointer events. A view can move to
  another container on page switches; an overlay's `onViewContainerChange`
  reports it.

## Render views and overlays

The display renders through view objects over one shared scene. `SceneContext`
exposes them: `ctx.views` (live list), `ctx.mainView` (the display page's
camera and controls), `ctx.addView(options)` and `ctx.removeView(view)`.
Each view owns its DOM container, perspective+orthographic cameras, orbit
controls, picking, and its viewport rectangle inside the shared canvas — the
quad-projection page (`/split-window`) is four views over the same scene.

A view can carry its own geometry cut (experimental: edits to the loaded
geometry reach the cut views only through `ctx.rebuildGeometrySlice()`).
Create the shared slice with `ctx.createGeometrySlice()` (an independently
clipped copy of the detector geometry; event data is never clipped), then
pass `geometrySlice`, a `clipPlane` (world-space normal + constant) and
optionally `tracksOnTop: true` (event data drawn over geometry regardless of
depth) in the `addView` options; the view then renders the copy. Mutate
`view.clipPlane` to move the cut at runtime. The display rebuilds the copy
after every geometry load. All views sharing the slice write their own plane
value before rendering: per-view cut positions are free; do not try to give
views different plane COUNTS (that is what the slice copy exists for).

Views select what they draw through camera layers, exported as
`GEOMETRY_MAIN_LAYER`, `GEOMETRY_SLICE_LAYER` and `EVENT_DATA_LAYER`. To add
objects to the event data (drawn in every view, never clipped, over the
geometry in tracks-on-top views), call `ctx.addEventObject(object)`.

To draw on top of a view (annotations, axes, widgets), attach an overlay:

```ts
onSceneInit(ctx: SceneContext): void {
  this.overlay = {
    render: (view) => { /* after the view's scene render, every frame */ },
    onViewResize: (view) => { /* view size/position changed */ },
    onViewContainerChange: (view) => { /* view moved to another element */ },
    dispose: () => { /* view or overlay removed */ },
  };
  ctx.mainView.addOverlay(this.overlay);
}
```

An overlay that renders its own viewport must set and restore the renderer's
viewport/scissor itself; `view.viewportRect` gives the view's rectangle with
the y coordinate already matching the active backend (WebGPU counts from the
top-left, WebGL from the bottom-left). The camera navigation cube is the
built-in consumer of this seam.

## Painter selection and knobs

A painter describes itself with a static `meta` block — its id, the piece
types it paints, and its configurable knobs:

```ts
export class MyPainter extends EventPiecePainter {
  static meta: PainterMeta = {
    id: 'my-painter',
    forPieceTypes: ['my.DataType'],
    label: 'My painter',
    configs: [
      { key: 'colorMode', default: 'pid', options: ['pid', 'momentum', 'solid'], label: 'Coloring' },
      { key: 'lineWidth', default: 30, min: 1, max: 300, label: 'Line width [mm]' },
    ],
  };

  override onConfigChanged(): void {
    // restyle existing objects from this.config.value(...) — live, no rebuild
  }
}
```

- When several painters register for one piece type, the config key
  `painters.byPiece.<pieceName>` selects which one draws each piece — from
  the painter panel, a server config file, or a `?config.` URL parameter.
  Without a selection, the first painter registered for the type draws it,
  whichever lazy chunk arrives first.
- Knobs are config keys too (`painters.byPiece.<pieceName>.<key>`), so the
  same precedence and scriptability apply. The right-pane painter panel
  auto-renders the knobs from the meta; there is no per-painter UI code.
- The knob names `visible` and `time` are reserved
  (`RESERVED_PAINTER_KNOB_KEYS`): `visible` is the piece visibility toggle the
  display applies, and `time` would share a storage key with the painter
  selection's timestamp. Registering a painter that declares either throws,
  and the display reports the painter as not registered.
- In contexts without a config system (web workers, scripts), painters run on
  the declared defaults.

## Selection and the model tree

The left pane's physics tree lists the event's pieces and entities from the
data model. Clicking an entity highlights its objects in 3D; clicking an
object in 3D reveals and highlights the entity in the tree. To join in,
painters call `registerEntityObject(index, object)` while building, and piece
types override `entityLabel(i)` / `entityRefs(i)` so entities get meaningful
labels and navigable reference links (a ring links to its trajectory, for
example).

## Data catalog and the data selector

The data selector is the control behind the **folder** button of the display
and the first card of the config page. It has three built-in tabs: **Presets**
(named datasets), **Physics** (pick by tags: process, beam, ...), and
**Manual** (geometry and events by URL or from a local file). The first two
list catalog content and hide themselves when no catalog is contributed, so
an installation without a catalog shows Manual only.

A catalog is plain data. Contribute it from a pack:

```ts
withDataCatalog({
  facets: [
    { key: 'process', label: 'Process', values: {
        'dis-nc': { label: 'DIS NC', description: 'Deep inelastic scattering, neutral current.', link: 'https://...' } } },
    { key: 'beam', label: 'Beam', values: { '10x100': { label: '10 × 100' } } },
  ],
  entries: [
    {
      name: 'DIS NC 10x100',
      description: 'Pythia 8, 5 events.',
      geometry: 'epic://tgeo/epic_craterlake.root',
      events: 'https://host/nc_10x100.firebird.zip',
      tags: { process: 'dis-nc', beam: '10x100' },
    },
  ],
  geometrySources: ['epic://tgeo/epic_ip6.root'],   // extra URLs for the Manual drop-down
})
```

The same object can come from the server (`dataCatalog` in `config.jsonc`,
which pyrobird passes through) or from a remote JSON file named by the
`catalog.url` setting. All sources merge in that order; facets with the same
key merge their value maps.

Entry fields: `geometry` absent keeps the loaded geometry (event-only
datasets); `events` absent shows no events (a geometry-only preset).
`eventRange` and `collections` apply when `events` is a ROOT file.

Tabs come from DI too. To add one:

```ts
withDataSelectorTab({
  id: 'campaigns', label: 'Campaigns', order: 15,
  load: () => import('./campaigns-tab.component').then(m => m.CampaignsTabComponent),
})
```

The tab component has no inputs. It injects `DataSelectionService`, shows
whatever it wants, and calls `updateDraft({ geometry, events, eventRange, collections })`
with what the user chose. The host owns the Show/Cancel buttons and applies
the draft through one path: the selection is written to the config keys
(`geometry.selectedGeometry`, `events.dexEventsSource` or
`events.rootEventSource`, `events.rootEventRange`, `events.rootCollections`),
and a live display reloads from them, the same load it runs at startup. The
config page has no display: it writes the keys and navigates to `/display`.

Local files the user picked are not persisted (a blob URL dies with the page):
they wait in the selection service and the display's next load consumes them.
After a reload the last URL loads again.

## Settings for extensions

A setting that changes how data looks is a painter knob. The template's ring
color is one:

```ts
export class CherenkovRingPainter extends EventPiecePainter {
  static meta: PainterMeta = {
    id: 'example-cherenkov-rings',
    forPieceTypes: ['example.CherenkovRing'],
    configs: [{ key: 'ringColor', default: '#00e5ff', label: 'Ring color' }],
  };

  // Build with this.config.value<string>('ringColor'); restyle here on changes.
  // The display schedules the next frame after this call.
  override onConfigChanged(): void { /* recolor the existing rings */ }
}
```

The knob becomes the config key `painters.byPiece.<pieceName>.ringColor`
(`painters.byPiece.ExampleRings.ringColor` for the sample data), appears in
the painter panel, and obeys the source priority (pack defaults < server <
saved browser settings < URL `?config.key=` < runtime), so a deep link or
batch script sets it too. A pack ships another default with
`withConfigDefaults({'painters.byPiece.ExampleRings.ringColor': '#ff4d00'})`.

Machinery extensions (a `ThreeExtension`) declare their settings through
`ConfigService.declare({key, default, label})` and react to
`valueSignal()` or `changes$`; the same priority applies.

## Geometry pipeline

Three seams adjust detector geometry for an experiment, in pipeline order:

1. **Pre-build TGeo rules**: `withRootGeometryRules({ editRules, cutLists })`.
   Named edit rule sets (selected by `geometry.rootFilterName`) remove or
   hide TGeo detail, and named cut lists (selected by `geometry.cutListName`)
   remove top-level detectors. The rules are plain data: the geometry worker
   receives them with each load request, because a prebuilt worker cannot
   import pack code. A rule pattern that matches several detectors edits each
   of them. The default for both config keys is `off`; a pack selects its rule
   set through `withConfigDefaults`. The data selector's "Optimize geometry"
   toggle switches between `off` and the rule set named `default`; it shows
   only when a pack registers that rule set, with the rule set's `label` as
   its hint.
2. **Themes**: `withGeometryTheme({ id, label, load })` registers subdetector
   rule sets (color, merge, outline) selected by `geometry.themeName`. The
   built-in theme is `grey`; `off` keeps the geometry's own colors.
3. **Post-processors**: `withGeometryPostProcessor({ id, after, load })`
   registers main-thread code that runs after each load, once the geometry
   sits in the scene (scaled to mm) and before the first frame shows it. The
   class gets `{ geometry, sceneGeometry, scene, renderer, clippingPlanes,
   fastMaterials }`, may be async, and is instantiated through DI.

```ts
firebirdPack('my-experiment',
  withRootGeometryRules(() => import('./my-geometry-rules').then(m => m.myRules)),
  withConfigDefaults({ 'geometry.rootFilterName': 'default', 'geometry.themeName': 'my-colors' }),
  withGeometryTheme({ id: 'my-colors', label: 'My colors',
    load: () => import('./my-theme').then(m => m.myRuleSets) }),
  withGeometryPostProcessor({ id: 'my.mirrors',
    load: () => import('./my-mirrors').then(m => m.MirrorProcessor) }),
)
```

The ePIC pack (`packages/epic/`) is the working example: its rule data, three
themes, a mirror prettifier and a detector arranger. Themes can take their
colors from the named palette `@dexvis/firebird-ng/geometry-palette`
(`STEEL_BLUE`, `AMBER_200`, ...; see geometry-rules.md).

## Camera views, the collision intro and toolbar actions

`withCameraPreset()` registers named views for `?cmd=camera-preset:<name>`,
the navigation cube's home button and the camera debug panel. The built-in
presets are the six face views and `home`, which frames the loaded geometry
from above. A pack pins its own `home` by registering a preset with that
name: the camera then starts there. Without `withCameraLimits()`, every
geometry load sets the orbit limits from the geometry's bounding sphere.

`withCollisionIntro(() => import('./beams-intro').then(m => m.BeamsIntro))`
sets the animation played before an event's time animation: the
`animate-collision` command and offline recordings play it. The intro class
builds its objects in `begin(parent)`, shows the state at a time in
`update(elapsedMs)`, and disposes them in `end()`.

`withToolbarAction({ id, icon, label, tooltip, command })` adds a button to
the time toolbar; a click dispatches the command. The ePIC pack adds the
collision button this way:

```ts
withToolbarAction({ id: 'collision', icon: 'close_fullscreen', label: 'Collision',
  tooltip: 'Animate with beam particles collision', command: { type: 'animate-collision' } })
```

## Loaders

A loader teaches Firebird a file format or URL scheme. It returns data and
never touches the display: `EventDisplayService` picks the loader, passes it
a context, and puts the result on screen. Every source takes this path: the
configured geometry and events, picked files, the data selector, the
`open-geometry` and `open-dex` commands.

```ts
@Injectable()
export class IgesGeometryLoader implements GeometryDataLoader {
  readonly meta = { id: 'iges', label: 'IGES geometry', fileExtensions: ['.igs', '.iges'] };
  readonly millimetersPerUnit = 1;

  canLoad(source: DataSource): boolean {
    return matchesFileExtensions(source, this.meta);
  }

  async load(source: DataSource, context: LoaderContext): Promise<Object3D> {
    const url = typeof source === 'string' ? context.resolveUrl(source) : URL.createObjectURL(source);
    const response = await fetch(url, { signal: context.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} (${url})`);
    return parseIges(await response.arrayBuffer());
  }
}
```

- **Claiming.** The first registered loader whose `canLoad(source)` accepts
  the source loads it. A `.root` name is ambiguous (geometry or events): the
  data selector probes the file and asks `canLoadContent(probe)` which field
  it belongs to.
- **Results.** `load()` resolves to the geometry root object in the loader's
  length unit, `millimetersPerUnit` (default 1; ROOT TGeo: 10). The display
  scales the geometry container by it, themes and post-processes the
  geometry, and replaces the previous one. `loadEvents()` resolves to a
  `DataExchange` (`DataExchange.fromDexObj(json)`); the display shows its
  first event.
- **Context.** `context.resolveUrl(url)` turns URL aliases (`asset://`, a
  pack's alias) and server paths into a URL `fetch()` reads.
  `context.signal` aborts when a newer load of the same kind starts: pass it
  to `fetch()`, and reject with `context.signal.reason` when it fires. The
  replaced load ends without an error.
- **Failures.** Reject with an `Error` whose message says what went wrong
  (HTTP status, unsupported version, entries outside the file): the display
  shows it to the user and lists it in `window.firebird.errors`.

`EventDisplayService.openGeometry(source)` and `openEvents(source)` (from
`@dexvis/firebird-ng/display`) start a load from code; they resolve to null
when a newer load replaced theirs. The built-in loaders
(`DexEventLoader`, `Root2DexEventLoader`, `Edm4eicEventLoader`,
`RootGeometryLoader`) are exported, so an application can register them
again in another order.

## Bundle discipline

Everything referenced from `app.config.ts` is loaded with the application
shell. Painter classes and display services pull three.js — hundreds of kB.
Keep them out of the startup path:

- register painters with `withLazyPainter` (dynamic import), and themes,
  post-processors, intros and large rule data through their `load` imports,
- in loaders and command handlers, load `@dexvis/firebird-ng/display`
  with a dynamic `import()` inside the method that needs it: a top-level
  import puts three.js into the initial bundle. A pack may inject
  `EventDisplayService`, `DataModelService` and `SelectionService` from
  there,
- import the core model from `@dexvis/firebird-core/model` (and loader or
  catalog helpers from `/loaders` and `/data-catalog`) in modules that
  `app.config.ts` reaches: the package root re-exports the painters, which
  pull three.js.

The built-in implementations in `packages/firebird-ng/src/lib/` follow this
pattern and are the reference.

## Rendering caveat

The WebGPU renderer silently skips `THREE.LineLoop` objects — they exist in
the scene, report `visible: true`, and never draw. Use a closed `THREE.Line`
strip (repeat the first point) instead. `Line`, `LineSegments`, `Line2`,
points and meshes render normally.
