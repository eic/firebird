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
    withEventGroup(MyDataFactory),
    withLazyPainter('my.DataType', () => import('./my.painter').then(m => m.MyPainter)),
    withDefaultGeometry('https://my.host/detector.root'),
  );
}
```

## The feature functions

| Function | Registers | Notes |
|----------|-----------|-------|
| `withEventGroup(FactoryClass)` | A decoder that turns a DEX group of your `type` into a model object | The model class is plain TypeScript (worker-safe, no Angular) |
| `withPainter(PainterClass, {forGroupType})` | A painter: turns model data into three.js objects | Eager — lands in the initial bundle |
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

If the code turns **data** (event groups, field maps, geometry) into visuals,
it is a **painter** — time-aware, per-group, selected by the data's type.
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
