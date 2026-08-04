# Extension System

Firebird is assembled from features: an application declares what it wants —
data types, painters, loaders, commands, settings — and the framework collects
the contributions through Angular dependency injection. Firebird's own
built-ins register through the same API, so anything a built-in can do, your
extension can do.

The working template is the `packages/firebird-example-extension` package in
the repository: a custom event data type (Cherenkov rings), its painter, and a
config key, installable with one line.

## Composing an application

```ts
// app.config.ts
import { provideFirebird, withFirebirdBuiltins, withUrlAlias } from '@firebird/ng';
import { withExampleCherenkov } from '@firebird/example-extension';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideFirebird(
      withFirebirdBuiltins(),
      withUrlAlias('epic://', 'https://eic.github.io/epic/artifacts/'),
      withExampleCherenkov(),
    ),
  ],
};
```

One contribution per `with*()` call. To ship several contributions as one
installable package (an "experiment pack"), compose them:

```ts
export function withMyExperiment(): FirebirdFeature {
  return firebirdFeatures(
    withEventPiece(MyDataFactory),
    withLazyPainter('my.DataType', () => import('./my.painter').then(m => m.MyPainter)),
    withDefaultGeometry('https://my.host/detector.root'),
  );
}
```

## The feature functions

| Function | Registers | Notes |
|----------|-----------|-------|
| `withEventPiece(FactoryClass)` | A decoder that turns a DEX piece of your `type` into a model object | The model class is plain TypeScript (worker-safe, no Angular) |
| `withPainter(PainterClass, {forPieceType})` | A painter: turns model data into three.js objects | Eager — lands in the initial bundle |
| `withLazyPainter(type, () => import(...))` | Same, loaded on demand | Preferred: painter code pulls three.js material code |
| `withThreeExtension(ExtClass)` | A rendering-machinery hook (see lifecycle below) | Instantiated through DI; `inject()` works in the constructor |
| `withLazyThreeExtension(() => import(...))` | Same, loaded after the scene is up, in its own chunk | For heavy extensions (VR, big overlays) |
| `withGeometryLoader(LoaderClass)` | A geometry file-format/URL-scheme loader | First loader whose `canLoad()` accepts the source wins |
| `withEventLoader(LoaderClass)` | An event data loader | Same selection rule |
| `withCommandHandler(HandlerClass)` | A command type on the [command bus](/command-bus) | Works from URL, server, and batch immediately |
| `withUrlAlias(prefix, base)` | A URL scheme alias, e.g. `epic://` | |
| `withConfigDefaults({key: value})` | Setting defaults (lowest priority tier) | A pack configures, never locks — every other source overrides |
| `withDefaultGeometry(url)` | The detector geometry loaded when nothing else selects one | Sugar for `withConfigDefaults({'geometry.selectedGeometry': url})` |

## Painter or ThreeExtension?

If the code turns **data** (event pieces, field maps, geometry) into visuals,
it is a **painter** — time-aware, per-piece, selected by the data's type.
If it hooks the **machinery** — scene lifecycle, frame loop, input, UI — it is
a **ThreeExtension**. Magnetic field lines that visualize a field map are a
painter; a hover-probe that raycasts under the mouse is an extension.

A built-in example to read: the camera navigation cube
(`firebird-ng/src/app/firebird/viewport-gizmo.extension.ts`) binds the
`@dexvis/viewport-gizmo` package to the scene, controls, frame loop and
command bus, and is registered with `withLazyThreeExtension` inside
`withFirebirdBuiltins()`.

## ThreeExtension lifecycle

```ts
@Injectable()
export class HoverInfoExtension implements ThreeExtension {
  onSceneInit(ctx: SceneContext): void {
    // scene, cameras, renderer, canvas are ready; attach listeners to ctx.canvas
  }
  onFrame(ctx: FrameContext): void {
    // every frame, before rendering; keep cheap, no allocation
  }
  onEventLoaded(event: Event): void {}
  onDispose(): void {
    // guaranteed on teardown; remove listeners and objects
  }
}
```

- `onSceneInit` fires strictly AFTER the renderer's async initialization —
  extensions never see a half-initialized scene, and never need "defer until
  ready" logic of their own.
- Rendering rules: state changes travel through signals/effects — never poll
  application state inside `onFrame`. After mutating anything renderable, call
  `ctx.invalidate()`. It is currently a no-op (the loop renders continuously),
  but it is the contract that keeps your extension working unchanged if the
  loop switches to render-on-demand.
- Do not start your own requestAnimationFrame chain against the scene; use
  `onFrame`.

## Render views and overlays

The display renders through view objects over one shared scene. `SceneContext`
exposes them: `ctx.views` (live list), `ctx.mainView` (the display page's
camera and controls), `ctx.addView(options)` and `ctx.removeView(view)`.
Each view owns its DOM container, perspective+orthographic cameras, orbit
controls, picking, and its viewport rectangle inside the shared canvas — the
quad-projection page (`/split-window`) is four views over the same scene.

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
- Knobs are config keys too (`painters.byPiece.<pieceName>.<key>`), so the
  same precedence and scriptability apply. The right-pane painter panel
  auto-renders the knobs from the meta; there is no per-painter UI code.
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

## Settings for extensions

Declare settings through the config registry; every declared key automatically
obeys the source priority (defaults < server < saved browser settings < URL
`?config.key=` < runtime) and is scriptable from links and batch:

```ts
const ringColor = configService.declare<string>({
  key: 'examples.cherenkov.ringColor',
  default: '#00e5ff',
  label: 'Cherenkov ring color',
  group: 'Example extension',
});
ringColor.changes$.subscribe(color => { /* react */ });
// or in signal-based code: effect(() => use(ringColor.valueSignal()))
```

## Bundle discipline

Everything referenced from `app.config.ts` is loaded with the application
shell. Painter classes and display services pull three.js — hundreds of kB.
Keep them out of the startup path:

- register painters with `withLazyPainter` (dynamic import),
- in loaders/handlers, resolve display services through dynamic `import()`
  inside the method that needs them, not through a top-level import.

The built-in implementations in `firebird-ng/src/app/firebird/` follow this
pattern and are the reference.

## Rendering caveat

The WebGPU renderer silently skips `THREE.LineLoop` objects — they exist in
the scene, report `visible: true`, and never draw. Use a closed `THREE.Line`
strip (repeat the first point) instead. `Line`, `LineSegments`, `Line2`,
points and meshes render normally.
