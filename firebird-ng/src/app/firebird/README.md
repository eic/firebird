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
  withEventGroup(CherenkovRingFactory),                     // DEX type decoder (worker-safe, @firebird/core)
  withPainter(CherenkovRingPainter, { forGroupType: 'example.CherenkovRing' }),
  withThreeExtension(HoverInfoExtension),                   // machinery hook (scene/frame/input)
  withGeometryLoader(IgesGeometryLoader),                   // teach Firebird a file format
  withCommandHandler(MyCommandHandler),                     // extend the command vocabulary
  withConfigDefaults({ 'geometry.selectedGeometry': 'epic://epic_full.root' }),
)
```

One contribution per `with*()` call. Bundles compose with `firebirdFeatures()`:
an experiment pack is one function returning a composed feature (see
`with-firebird-builtins.ts`, or `@firebird/example-extension` for a complete
out-of-tree example with its own group type, painter and config).

## Painter or ThreeExtension?

If it turns **data** (event groups, fields, geometry) into visuals, it is a
**painter** — time-aware, per-group, config-driven. If it hooks the
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
where URL values win for the session without being persisted. The same schema
shape is planned to drive auto-rendered config panels.

## Commands

Serializable commands drive the display from URLs, server config and batch:
`?dex=<url>&event=2`, `?cmd=type:arg;type:arg`, config.jsonc
`startupCommands`, `pyrobird screenshot --commands "..."`. Add your own with
`withCommandHandler` — implement `type`, `execute(cmd)`, and optionally
`fromUrlArg(arg)` for the URL grammar. Batch tools await
`window.firebird.ready` (geometry loaded, startup commands done).
