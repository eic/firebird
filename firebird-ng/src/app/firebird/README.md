# Firebird extension system

This directory is the public API of the Firebird Angular extension system,
imported as `@firebird/ng`. An application — Firebird's own or an external
experiment's — assembles its event display by composing features:

```ts
// app.config.ts
provideFirebird(
  withFirebirdBuiltins(),                                   // Firebird's own factories/painters/loaders/commands
  withUrlAlias('epic://', 'https://eic.github.io/epic/artifacts/'),

  // an experiment's contributions:
  withEventPiece(CherenkovRingPieceFactory),                // DEX type decoder (worker-safe, @firebird/core)
  withPainter(CherenkovRingPainter, { forPieceType: 'example.CherenkovRing' }),
  withThreeExtension(HoverInfoExtension),                   // machinery hook (scene/frame/input)
  withGeometryLoader(IgesGeometryLoader),                   // teach Firebird a file format
  withCommandHandler(MyCommandHandler),                     // extend the command vocabulary
  withDefaultGeometry('epic://epic_full.root'),                  // sugar for withConfigDefaults({'geometry.selectedGeometry': ...})
)
```

One contribution per `with*()` call. Bundles compose with `firebirdFeatures()`:
an experiment pack is one function returning a composed feature (see
`with-firebird-builtins.ts`, or `@firebird/example-extension` for a complete
out-of-tree example with its own piece type, painter and config).

## Painter or ThreeExtension?

If it turns **data** (event pieces, fields, geometry) into visuals, it is a
**painter** — time-aware, per-piece, config-driven. If it hooks the
**machinery** — scene lifecycle, frame loop, input, UI — it is a
**ThreeExtension**. Field lines visualizing a field map are a painter, not an
extension.

## ThreeExtension lifecycle

- `onSceneInit(ctx)` runs strictly AFTER the async renderer init resolved.
  Never touch the scene before it. Attach input listeners to `ctx.canvas`
  (an `AbortController` is the documented cleanup idiom).
- `onFrame(ctx)` runs inside the render loop. Keep it cheap: no allocation.
- `onEventLoaded(event)` fires when a new event was painted.
- `onDispose()` is guaranteed on teardown — remove listeners and objects.
- Heavy extensions register with `withLazyThreeExtension(() => import(...))` —
  they load in their own chunk after the scene is up, and receive the
  `onSceneInit` call they missed.

## Render views and overlays

The scene renders through **RenderView** objects (`ctx.views`, `ctx.mainView`
on `SceneContext`). `ThreeService` keeps the one Scene and the one render
loop; each view owns its DOM container, cameras, OrbitControls, picking and
viewport rectangle inside the shared canvas. The main display is `views[0]`;
the quad-projection page adds three orthographic views over the same scene.

- **Add a view**: `ctx.addView({ name, container, orthographic,
  fixedDirection })` — the container must sit above the shared canvas (see
  `pages/split-window` for the reference layout). Remove it with
  `ctx.removeView(view)` when your page/panel goes away.
- **Draw on top of a view**: `view.addOverlay({ render, onViewResize,
  onViewContainerChange, dispose })`. `render(view)` runs every frame after
  the view's scene render; set your own viewport/scissor from
  `view.viewportRect` and restore what you change. The navigation cube
  (`viewport-gizmo.extension.ts`) is the built-in consumer of this seam.
- Cameras and `camera.up` handling are per view. When you change a view's up
  vector, use `view.setCameraUp()` — OrbitControls captures the up axis at
  construction and must be resynced.

## Rendering rules (read before writing onFrame)

1. **No per-frame polling as change propagation.** State changes travel
   through signals and effects; `onFrame` is for animation only. Code that
   polls app state every frame breaks silently if the loop later switches to
   render-on-demand — and it will not be your code that gets debugged.
2. **Changed something renderable? Call `ctx.invalidate()`.** It is a no-op
   today (the loop renders continuously), but it is the contract that keeps
   your extension working unmodified if the loop later renders on demand.
3. **The render loop lives in exactly one place** (`ThreeService.renderLoop`).
   Do not start your own rAF chain against the same scene; use `onFrame`.

## Bundle discipline

Anything referenced from `app.config.ts` lands in the initial bundle. Painter
classes pull three.js material code — register built-in-style painters with
`withLazyPainter(type, () => import(...))`, and keep loaders/handlers that
need display services resolving them through dynamic imports (see
`builtin-loaders.ts` for the pattern).

## Configs

Declare configs through `ConfigService.declare({ key, default, label, ... })`.
Every declared key obeys the source precedence
`defaults < server(config.jsonc) < localStorage < URL (?config.key=value) < runtime`,
where URL values win for the session without being persisted.

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
  key `painters.byPiece.<pieceName>` (default: first registered) picks which
  one paints each piece — from the panel, a yaml file, or a URL.
- **Knobs** live under `painters.byPiece.<pieceName>.<key>` with normal config
  precedence. The right-pane painter panel auto-renders them from the meta —
  no per-painter UI code.
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
`fromUrlArg(arg)` for the URL grammar. Batch tools await
`window.firebird.ready` (geometry loaded, startup commands done).
