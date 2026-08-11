# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Firebird** is a web-based event display framework for particle physics experiments, 
specifically designed for the Electron-Ion Collider (EIC). 
It visualizes detector geometries, particle trajectories, and physics processes using modern web technologies. 
Firebird serves research, debugging/QC, and educational purposes.

**Live deployment:** https://seeeic.org (Firebird Event Display application)
**Documentation:** https://eic.github.io/firebird/ (VitePress documentation site)

## Repository Structure

This is a **monorepo** with **npm workspaces** (root `package.json` lists the members; run `npm install` at the repo root, not inside a member):

- **firebird-ng/** - Angular 22 frontend (TypeScript, Three.js WebGPU, signals, zoneless)
- **packages/firebird-core/** - `@firebird/core`: worker-safe plain TS (event model, DEX io, painters). No Angular injector, no bootstrap; the web workers run this code. Enforced by `packages/firebird-core/src/no-injector.spec.ts`.
- **dexvis/** - git submodules of the generic [github.com/dexvis](https://github.com/dexvis) packages, wired into the workspaces so `@dexvis/*` imports resolve to the submodule sources (tsconfig `paths`):
  - `root-geo-tree-editor` -> `@dexvis/root-geo-tree-editor` (TGeo walk/find/edit)
  - `threejs-tree-editor` -> `@dexvis/threejs-tree-editor` (three tree edit/merge/outline, geometry processor)
  - `app-shell-ng` -> `@dexvis/shell` (app chrome: shell layout + theming); Firebird wraps it in `components/firebird-shell/`
  - `viewport-gizmo` -> `@dexvis/viewport-gizmo` (camera navigation cube; fork of three-viewport-gizmo — cube-only, WebGPU fixes, configurable HENP view orientations, roll/home buttons); Firebird binds it in `firebird/viewport-gizmo.extension.ts`
- **pyrobird/** - Python Flask backend (file server, ROOT conversion)
- **dd4hep-plugin/** - C++ Geant4/DD4Hep plugin (trajectory extraction during simulation)

Commits inside `dexvis/*` submodules and npm publishes of those packages are separate, deliberate actions - edits land in the submodule working tree first.

The documentation source lives in:
- **docs/** - VitePress documentation site (deployed to GitHub Pages)

## Common Development Commands

### Frontend (firebird-ng)

```bash
npm install                    # At the REPO ROOT (npm workspaces; single lockfile)

cd firebird-ng

# Development server with hot reload
npm run serve                  # http://localhost:4200

# Testing (Vitest via the Angular unit-test builder)
npm test                       # Interactive tests
npm run test:headless          # CI mode
npm test -w @firebird/core     # Core package tests (from repo root)
npm test -w @dexvis/threejs-tree-editor   # Dexvis submodule tests (from repo root)

# Building
npm run build                 # Production build
npm run build:ghpages         # GitHub Pages deployment
npm run build:watch           # Watch mode for development

# Generate components (Angular CLI)
ng generate component component-name
ng generate service service-name
```

Version notes: `jsroot` and `jsdom` track latest via root `package.json`
`overrides`. jsroot's node-only native imports (`@resvg/resvg-js`, `canvas`)
are excluded from the browser bundle through `externalDependencies` in
`firebird-ng/angular.json` — the root `browser`-field stub map does not catch
scoped packages imported from another package's context. Change overrides
deliberately with a full lockfile regen (`rm package-lock.json node_modules
-rf && npm install`), never via drift.

### Backend (pyrobird)

```bash
cd pyrobird

# Development installation with all optional features
python -m pip install --editable .[dev,batch,xrootd]

# Start development server
pyrobird serve                                    # Serves files from CWD
pyrobird serve --work-path=/path/to/data         # Restrict to specific directory
gunicorn --bind 0.0.0.0:5454 pyrobird.server:flask_app --log-level debug

# Testing (requires dev dependencies)
pytest ./tests/unit_tests                        # Run unit tests
pytest ./tests/integration_tests                 # Run integration tests
pytest -x --pdb                                  # Stop on first error, debug
pytest ./tests/unit_tests/test_cli.py            # Run single test file
pytest ./tests/unit_tests/test_cli.py::test_name # Run specific test

# CLI utilities
pyrobird convert input.root output.json          # Convert ROOT to Firebird DEX
pyrobird merge file1.json file2.json -o out.json # Merge DEX files
pyrobird geo geometry.root                       # Extract geometry
```

### DD4Hep Plugin (dd4hep-plugin)

```bash
cd dd4hep-plugin
mkdir build && cd build
cmake ..
make && make install        # Installs to ./prefix/lib

# Make library discoverable
cd ..
export LD_LIBRARY_PATH="$(pwd)/prefix/lib:$LD_LIBRARY_PATH"

# Run simulation with plugin
ddsim --steeringFile=firebird_steering.py \
      --compactFile=detector.xml \
      -N=100 \
      --outputFile=sim.edm4hep.root \
      --inputFiles=input.hepmc
```

### Full Build (all components)

```bash
# Root level orchestration
python build.py all              # Build frontend and copy to pyrobird
python build.py --dry-run all    # Test build without changes

# build all with changing version (source files will be changed)
python build.py all --version=v2025.12.1
```

`build.py all` also runs the test suites. The backend tests use `pyrobird/.venv`
when it exists, otherwise `uv run --extra dev`, so the interpreter that starts
build.py does not need pyrobird's dependencies. To skip the test steps:

```bash
python build.py all --no-test
```

Itemized steps, to build and deploy the frontend into pyrobird only:

```bash
python build.py build_ng         # ng production build
python build.py cp_ng            # copy dist into pyrobird/pyrobird/server/static
```

## Running and Verifying Changes

How to check that Firebird actually works after a change — from fastest to most
thorough. An agent with no other context should be able to follow this section
alone.

### Level 1: test suites (no browser)

```bash
npm run test:headless --workspace=firebird-ng   # Angular app (vitest)
npm test -w @firebird/core                      # core package
npm test -w @dexvis/threejs-tree-editor
npm test -w @dexvis/root-geo-tree-editor
cd pyrobird && .venv/bin/python -m pytest ./tests/unit_tests -q
```

Tests do NOT catch zoneless UI freezes (a plain field mutated from RxJS/rAF
callbacks compiles fine but never updates the template) or WebGPU rendering
gaps — those need a live or headless browser check.

### Level 2: headless screenshot (production build via pyrobird)

```bash
python build.py build_ng && python build.py cp_ng    # deploy frontend into pyrobird
cd /tmp   # screenshots land in ./screenshots/ with auto-numbering
/path/to/repo/pyrobird/.venv/bin/pyrobird screenshot \
  --url "http://localhost:5454/display?dex=asset://data/example-cherenkov.firebird.json&event=2" \
  --commands "camera-preset:farforward" \
  --output-path check.png
```

The command starts the server, waits for `window.firebird.ready === true`
(geometry loaded, events loaded, startup commands executed — set by the app's
BatchStatusService), captures, and shuts the server down. `--ready-timeout N`
(default 120 s) controls the wait; on timeout it falls back to a fixed sleep
and still captures (look for the WARNING in stdout — a capture after that
warning may show a half-loaded display). Requires Playwright + Chromium in the
venv (`pip install pyrobird[batch]`, `playwright install chromium`).

The bundled sample `asset://data/example-cherenkov.firebird.json` has 3 events
(event_2 has 4 rings + 2 tracks) and needs no network access beyond the
geometry URL from config.

### Level 3: dev server + scripted browser (for pixel-level checks)

```bash
cd firebird-ng && npm run serve      # http://localhost:4200, wait for compile
```

Drive it with Playwright (python: `pyrobird/.venv` has it). Rules that make
captures reliable:

- Launch Chromium with `--disable-background-timer-throttling
  --disable-renderer-backgrounding --disable-backgrounding-occluded-windows`.
  Background/headless tabs throttle requestAnimationFrame to ~1 fps, which
  freezes the app's render loop — screenshots show stale frames.
- Even with the flags, force frames explicitly before every capture instead of
  trusting the loop. Dev mode exposes Angular's debug API on the page:

  ```js
  const c = ng.getComponent(document.querySelector('app-main-display'));
  const three = c.eventDisplay.three;
  three.controls.update();
  three.renderer.render(three.scene, three.camera);   // repeat 2-3x
  ```

- Wait on `window.firebird.ready === true` (only exists on /display), not on
  fixed sleeps. Give `page.screenshot(timeout=90_000)` a long timeout — the
  first screenshot after heavy geometry can take tens of seconds.
- Camera/clipping are scriptable through the same debug handle:
  `three.camera.position.set(...)`, `three.controls.target.set(...)`,
  `three.enableClipping(true)`, `three.setClippingAngle(start, opening)`.

### Deep-link cheat sheet (works in browser and headless)

```
/display?dex=<url>                      load event data (DEX json/zip, or .root via server conversion)
        &geometry=<url>                 load detector geometry
        &event=N                        select event index after load
        &config.<key>=<value>           session-scoped config override (not persisted)
        &cmd=type:arg;type:arg          generic command list, e.g. cmd=camera-preset:farforward
/split-window?dex=<url>&event=N&cmd=...  quad projection view (Top/Side/Front-XY/3D with
                                        per-view geometry cuts, tracks-on-top, lil-gui
                                        panel); same startup commands and config keys as
                                        /display (one shared auto-load path). Demonstrator
                                        knobs: config.quadView.{top,side,front}.clipPos [mm],
                                        config.quadView.{top,side,front,main}.tracksOnTop
```

Quad-view headless proof: `space/phase5/capture_quad.py <out.png> [base_url]
[front_clip_z] [zoom]` waits for 4 views + geometry + event data + the
geometry slice, enables the 3D wedge, forces explicit per-view renders,
captures. With heavy geometry under software GL the first stable frame can
take minutes (4 scene renders per frame) — the script uses a 300 s screenshot
timeout. Render-on-demand + recording gates: `space/phase5/check_on_demand.py`,
`space/phase5/check_recording.py`.

`pyrobird screenshot --commands "..."` and `pyrobird serve --startup-commands
"..."` feed the same command grammar through the server config.

### What goes wrong (symptoms → causes)

- **Blank/stale canvas in captures**: two distinct causes. (a) rAF throttling
  in background tabs (see Level 3) — force renders explicitly. (b) The
  render loop is ON-DEMAND by default (config `rendering.mode`): with nothing
  changing, nothing redraws and the perf box shows "idle" — that is correct
  behavior, not a hang. Scripts must force renders (they already do) or pass
  `?config.rendering.mode=continuous`.
- **Object exists in scene, visible=true, but never draws**: WebGPURenderer
  silently skips `LineLoop` objects (no warning). Use closed `Line` strips.
  `Line`, `LineSegments`, `Line2`, meshes are fine.
- **Clipping cut follows the camera after toggling clipping on/off** (orbit
  moves the cut, zoom clips deeper): a stale-shader three.js bug — cached
  shader states bind the plane arrays a ClippingContext held at build time,
  and the context REPLACES those arrays when its parent group chain changes.
  Guarded by `ThreeService.dropClippingShaderState()` (drops render objects
  AND the node-builder cache on every clipping STRUCTURE change) +
  three-clipping-internals.spec.ts, which pins the three behavior; if the
  symptom reappears (e.g. after a three upgrade), check the console for the
  drop method's warning and that spec first.
- **Two clipping groups clip with the same (wrong) planes**: the renderer
  caches built shader states by plane COUNTS only — sibling ClippingGroups
  with the same (intersection:union) count shape share one shader bound to
  ONE group's plane array. Every group must have a distinct shape; the
  geometry slice uses `1 intersection : 0 union` (a shape the wedge/Z chain
  never produces) for exactly this reason. See geometry-slice.ts.
- **UI value frozen while console shows updates**: zoneless change detection —
  the template reads a plain field mutated outside Angular (RxJS subscribe,
  rAF, native listener). Convert the state to a signal.
- **`NG0203` at startup**: `inject()` called after an `await` in an async
  initializer/factory — the injection context does not survive async
  boundaries. Collect all `inject()` results before the first `await`.
- **`Cannot find package '@angular/...'` after installs**: a nested
  package-lock.json reappeared. Only the ROOT lockfile may exist; delete
  nested locks + node_modules and `npm install` at the repo root.
- **Build errors mentioning `.node` files or `node:` requires**: a dependency
  gained a node-only import the browser bundle can't process. Exclude the
  offending package via `externalDependencies` in `firebird-ng/angular.json`
  (how jsroot's `@resvg/resvg-js` and `canvas` are handled); the root
  package.json `browser` stub map works only for unscoped modules. Override
  changes need a full lockfile regen: `rm package-lock.json node_modules -rf
  && npm install`.
- **Tracks render as thin hairlines + console `THREE.TSL:` errors naming a
  `three_src_*` chunk**: something imports from `three/src/...`, which loads
  a second copy of three's node system with separate TSL state. Import from
  `three`, `three/webgpu`, `three/tsl`, or `three/examples/...` only.
- **Dev server serves stale code after tsconfig/node_modules changes**:
  restart it (vite cache).
- **Initial bundle jumps by hundreds of kB**: something referenced from
  `app.config.ts` statically imports the display stack (three.js), or a
  route component is imported statically in `app.routes.ts` (all routes must
  use `loadComponent`). Use `withLazyPainter` / dynamic imports; check with
  `ng build --stats-json`. Healthy initial total is ~177 kB. Trap: a module
  statically imported by an initial-bundle file carries its FULL used-export
  set into main — Material's inputs import `@angular/forms/signals`, so an
  eagerly-routed Material form page drags Signal Forms machinery into main
  the moment any lazy page starts using it.
- **`localStorage is not defined` in specs**: the test jsdom lacks it; a
  polyfill lives in `firebird-ng/src/test-setup.ts` — do not remove it.
- **Every console line appears twice in captured logs**: artifact of CDP-based
  console capture (browser-pane tools attach duplicate listeners) — the page
  logs each line once. When exact counts matter, instrument in-page: patch
  `console.*` in a Playwright init script and read the recorded array.
- **Killing the dev server with `pkill -f`**: the pattern can match your own
  wrapper shell and kill it — use exact process names or the serve terminal.

## High-Level Architecture

Firebird is made so that running frontend alone is sufficient for most use cases.
Backend serves for:
- some file conversions (e.g. working with xrootd, editing events, etc.)
- serving firebird locally for users
- using pip install for deployment


### Frontend Architecture (firebird-ng)

The Angular application is **zoneless** (no zone.js; `provideZonelessChangeDetection()`)
with **OnPush on every component**. State that a template reads must be a signal
(or arrive via async pipe / event handler) - a plain field mutated from an RxJS
subscription, rAF callback, or native listener will NOT update the UI.

It uses a **service-oriented architecture** with clear separation of concerns:

#### Core Services Layer

- **three.service.ts** (~1400 lines) - Central Three.js orchestration
  - `WebGPURenderer` (from `three/webgpu`) with automatic WebGL2 fallback; `init()` is **async**
  - ONE Scene, ONE render loop, frame callbacks, clipping, BVH
  - The loop is a SCHEDULER: on-demand by default (config `rendering.mode`,
    `'on-demand' | 'continuous'`) — renders happen when dirty flags were set
    by events/signals/`invalidate()`, never by polling. `invalidate()` is the
    primitive; animations seed one invalidate and re-invalidate from their
    update until they settle (tween group, gizmo transitions, damping).
    Per-view dirty flags gate WHETHER a frame renders; a multi-view frame
    always repaints ALL views — the canvas drawing buffer does not survive
    compositing, so partial per-view repaints would present skipped views
    as cleared background.
  - Clipping: the main chain (wedge + Z groups) clips the ORIGINAL geometry;
    `createGeometrySlice()` adds an independently clipped geometry COPY for
    projection views (see geometry-slice.ts — per-view plane VALUES are free,
    per-view plane COUNTS require the copy). `sceneEvent` is never clipped.
  - Renders through **RenderView** objects (`services/render-view.ts`):
    views[0] is the main view; `addView()/removeView()` add projections over
    the same scene. ThreeService's `camera/controls/setCameraUp/...` API
    delegates to the main view.

- **render-view.ts** (~600 lines, plain TS class) - One view of the shared scene
  - Owns: DOM container, perspective+orthographic cameras, OrbitControls
    (listening on the container), viewport/scissor rect in the shared canvas
    (backend-aware: WebGPU viewport origin is top-left, WebGL bottom-left),
    per-view raycasting (`raycasterFromEvent`), overlays (`addOverlay`),
    per-view clipping (`clipPlane` + `geometrySlice`), `tracksOnTop`
    (event data over geometry via a second pass with a depth-only clear),
    `dirty` (render-on-demand flag)
  - Per-view camera.up handling: `setCameraUp` resyncs OrbitControls' captured
    quaternion; pole-proximity re-anchoring keeps orbiting past the poles
  - The navigation cube is a `ViewOverlay` on the main view; the quad view
    (`/split-window`) is Top/Side/Front-XY orthographic + the main 3D view
    over one scene, rendered with scissors on one canvas, each with its own
    geometry cut
  - Layer scheme (geometry-slice.ts): 0 shared/helpers, 1 original geometry
    (main view), 2 slice copy (projection views), 3 event data (all views;
    lights carry it too so tracks-on-top passes collect identical light sets)

- **selection.service.ts** - The one selection: `(pieceName, entityIndex)`
  - 3D click → painter-stamped object resolves to its entity (`entityRefOf`);
    tree/panel selection → painter highlights its objects
    (`highlightEntity`/`unhighlightEntity`); painters own the entity↔object
    arrays (id ≡ index), registered via `registerEntityObject`
  - `selectedPiece` drives the right-pane painter panel

- **event-display.service.ts** - High-level event visualization
  - Data loading (geometry, events, ROOT files)
  - Time animation and event cycling
  - Painter orchestration
  - Animation manager integration

- **geometry.service.ts** - Detector geometry management
  - Load and process ROOT geometry files
  - Geometry optimization and post-processing

- **data-model.service.ts** - Event data management
  - Load Firebird DEX format events
  - Load EDM4eic ROOT files
  - Event registry and navigation

#### Data Model Layer (`@firebird/core`)

The event model, DEX io, and painters live in **`packages/firebird-core`** (plain
worker-safe TS, imported as `@firebird/core`), not in the Angular app.

The **event piece factory pattern** enables extensibility (a "piece" is one
named block of typed entity data inside an event):

- `EventPiece` - Abstract base class for all event components
- `BoxHitPiece` - Tracker hits (columnar: `pos`/`dim`/`time`/`edep` typed arrays)
- `PointTrajectoryPiece` - Particle trajectories (param columns + ragged points)
- Core has NO import side effects: workers/scripts call `initPieceFactories()`
  and `registerDefaultPainters(painter)` explicitly; the Angular app registers
  the same classes through DI (see the extension system below).

#### Extension system (`@firebird/ng` = `firebird-ng/src/app/firebird/`)

The app is assembled with `provideFirebird(...features)` in `app.config.ts` —
the same composition API an external experiment uses. One contribution per
`with*()` call; packs compose with `firebirdFeatures()`:

```ts
provideFirebird(
  withFirebirdBuiltins(),                       // Firebird's own factories/painters/loaders/commands
  withUrlAlias('epic://', 'https://eic.github.io/epic/artifacts/'),
  withExampleCherenkov(),                       // an out-of-tree pack (packages/firebird-example-extension)
)
```

Registration surfaces: `withEventPiece` (DEX decoders), `withPainter` /
`withLazyPainter` (data → visuals), `withThreeExtension` /
`withLazyThreeExtension` (machinery hooks: onSceneInit after async init,
onFrame, onEventLoaded, onDispose), `withGeometryLoader` / `withEventLoader`
(file formats, registry-selected by `canLoad()`), `withCommandHandler`
(command bus), `withConfigDefaults`. Author guide with the rendering and
bundle rules: `firebird-ng/src/app/firebird/README.md`. Template package:
`packages/firebird-example-extension/`.

**Bundle rule:** anything referenced from `app.config.ts` lands in the initial
bundle — heavy classes (painters, display services) must be reached via
`withLazyPainter` / dynamic imports. Eager wiring of the display stack doubles
the initial bundle; see `firebird-ng/src/app/firebird/builtin-loaders.ts` for
the pattern.

**Config precedence:** `defaults < server config.jsonc < localStorage <
URL ?config.key=value < runtime`; URL values are session-scoped, never
persisted. One canonical `ConfigProperty` per key — always keep the reference
returned by `ConfigService.addConfig()/declare()`.

**Commands:** serializable commands drive the display from URL deep links
(`?dex=<url>&event=N`, `?cmd=type:arg;...`), server config `startupCommands`,
and batch (`pyrobird screenshot --commands "..."`). Batch tools await
`window.firebird.ready` (geometry loaded + startup commands done).

#### Painter System

Painters render event data to Three.js objects using **time-aware rendering**
(all in `packages/firebird-core/src/painters/`):

- `data-model-painter.ts` - Main orchestrator (filters by time range)
- `trajectory.painter.ts` - Particle tracks with smooth splines
- `box-hit.painter.ts` - Individual tracker hits
- `step-track.painter.ts` - Geant4 step-by-step trajectories

The system uses Angular signals for reactive time updates that automatically propagate through the painter hierarchy.

**Painter meta and knobs:** painters declare `static meta: PainterMeta` —
id, `forPieceTypes`, and `configs` (knob descriptors). Painter SELECTION is
the config key `painters.byPiece.<pieceName>` (default: first registered for
the type); knobs live under `painters.byPiece.<pieceName>.<key>` — both obey
normal config precedence, so yaml/URL/panel all reach them. Instances read
knobs through `this.config` (a `PainterConfigView` — plain signals, worker
safe) and restyle live in `onConfigChanged()`. The right-pane painter panel
(`components/painter-config-panel/`) auto-renders from the meta using Signal
Forms (`@angular/forms/signals`) + Angular Aria listboxes. Note: `[formField]`
rejects min/max bindings on the same input, so the range slider binds manually.

**Model tree (left pane, default):** `components/model-tree/` walks the data
model (Event → pieces → entities), never the three scene; the scene tree stays
as the switchable debug view. Pieces describe entities via `entityCount`,
`entityLabel(i)`, `entityRefs(i)` (base-class methods on `EventPiece` that
custom types override); refs render as navigable links.

### Backend Architecture (pyrobird)

Flask server with three main API endpoints:

- `GET /api/v1/download` - Secure file downloads with access control
- `GET /api/v1/convert/edm4eic/<event>` - Convert EDM4eic events to JSON
- `GET /assets/config.jsonc` - Serve dynamic configuration

**Security model** (restrictive by default):
- `--work-path` restricts downloads to specific directory (default: CWD)
- `--allow-any-file` disables path restrictions (DANGEROUS in production)
- `--disable-files` disables all downloads
- Path traversal prevention built-in

### DD4Hep Plugin Architecture

Three Geant4 actions for trajectory extraction:

1. **FirebirdTrajectoryWriterEventAction** (PRIMARY USE CASE)
   - Saves trajectories at end of event (same as Geant4 event display)
   - Extensive filtering: momentum, vertex position, step cuts, particle type
   - Configured via Python steering files

2. **FirebirdTrajectoryWriterSteppingAction** (CUSTOMIZATION)
   - Captures data step-by-step as simulation runs
   - Users modify C++ code for custom physics data extraction
   - Access to detailed internal Geant4 information

3. **TextDumpingSteppingAction** (SIMPLE TEXT OUTPUT)
   - Easy-to-parse text format for custom analysis
   - Example for plugin extension

## Firebird Data Exchange Format (DEX)

Standardized JSON format for event data interoperability. Version **1.0**,
columnar: an event holds `pieces`, each piece holds parallel `columns` arrays
where entity id equals array index. JSON Schema: `dex-schema/`; full format
docs: `docs/dex.md`.

```jsonc
{
  "type": "firebird-dex-json",
  "version": "1.0",
  "origin": { "source": "filename.root", "by": "Pyrobird" },
  "events": [
    {
      "id": "event_0",
      "pieces": [
        {
          "name": "BarrelHits", "type": "BoxHit", "version": "1.0",
          "count": 2,
          "columns": {                       // parallel arrays, hit id == index
            "pos": [x0,y0,z0, x1,y1,z1],     // flat xyz per hit
            "dim": [...], "time": [t0,t1], "edep": [e0,e1]
            // writers declare only the columns they have (sim omits errors)
          }
        },
        {
          "name": "CentralTracks", "type": "PointTrajectory", "version": "1.0",
          "count": 1,
          "columns": { "theta": [...], "pdg": [...] },   // one value per trajectory
          "refs": { "particle": "McParticles" },         // optional: index columns into other pieces, -1 = null
          "pointColumns": ["x","y","z","t","dx","dy","dz","dt"],
          "points": [ [[x,y,z,t,...], ...] ]             // ragged: one point list per trajectory
        }
      ]
    }
  ]
}
```

**Key types:**
- `BoxHit` - 3D box hits with energy/time information
- `PointTrajectory` - Polyline trajectories with per-name parameter columns
- Extensible via factory pattern for custom piece types (namespaced, e.g. `example.CherenkovRing`)

Old 0.04 files do not load; convert once with `pyrobird upgrade in.firebird.json out.firebird.json` (.zip works).

## Important Architectural Patterns

### 1. Factory Pattern for Event Components

Piece factories enable DEX deserialization without modifying core code. In the Angular app, register new types with `withEventPiece(MyFactory)` inside `provideFirebird(...)`; in workers/scripts (no DI), call `registerEventPieceFactory()` explicitly. There are no import-side-effect registrations.

### 2. Time-Aware Rendering

The painter system filters data by time range using Angular signals:
- `EventTime` signal propagates through painter hierarchy
- Components show/hide based on time range
- Tween.js enables smooth animations

### 3. Clipping (Angular Wedge / Z-axis / per-view cuts)

- **Only geometry is clipped** — event data (`sceneEvent`) must NEVER be clipped.
- `sceneGeometry` is a `ClippingGroup` (WebGPU); clipping planes are set on the group, not on individual materials.
- `sceneEvent` is a regular `THREE.Group` — do not convert it to `ClippingGroup`.
- Per-view cuts (projection views) use `ThreeService.createGeometrySlice()`:
  an independently clipped geometry COPY routed by camera layers, with one
  shared plane whose VALUE each view writes before its render. Never give a
  view a different plane COUNT on the same objects — shader caches key on
  counts and per-frame count flips rebuild every render object. Every
  ClippingGroup in the scene must keep a DISTINCT (intersection:union)
  count shape (see geometry-slice.ts).

### 4. BVH Acceleration

`three-mesh-bvh` provides fast raycasting for object selection:
- Lazy BVH computation on demand
- Frustum culling for performance
- Critical for large detector geometries

### 5. Service Singletons

Angular services are singletons managing global state:
- Scene management (three.service)
- Event data (data-model.service)
- Configuration (config.service)
- URL parameters (url.service)

### 6. Security by Configuration (pyrobird)

Restrictive defaults prevent unauthorized file access:
- Explicit opt-in for dangerous features
- Path traversal prevention
- CORS disabled by default

## Testing Infrastructure

### Frontend Testing
- **Framework:** Vitest (Angular `unit-test` builder); `@firebird/core` and the dexvis packages run plain Vitest
- **CI:** GitHub Actions on every push/PR
- Run tests: `npm test` or `npm run test:headless` (app); `npm test -w @firebird/core` (core)

### Backend Testing
- **Framework:** pytest
- **CI:** GitHub Actions (Python 3.9-3.12)
- Run tests: `pytest ./tests/unit_tests`
- Debug: `pytest -x --pdb`

## Code Standards

### Python (pyrobird)
- **Style:** PEP8 required
- **Docstrings:** NumPy style format
- **Type hints:** Use throughout
- **Exceptions:** Use specific exceptions, not generic ones
- **Dependencies:** Add to `pyproject.toml` with justification

### TypeScript (firebird-ng)
- **Type safety:** Strict TypeScript compilation
- **Components:** Standalone Angular components (Angular 22), `ChangeDetectionStrategy.OnPush`
- **Reactive programming:** Angular signals first (zoneless); RxJS where streams fit better
- **Worker-safe core:** code in `packages/firebird-core` must never use `@Injectable`, tokens, `HttpClient`, or components
- **Bundle size:** 2MB warning, 5MB error limits

## CI/CD and Deployment

### GitHub Actions Workflows

- **frontend.yaml** - Build and test Angular app (CI only, no deployment)
- **docs.yaml** - Build and deploy VitePress documentation to GitHub Pages
- **pyrobird.yaml** - Test Python package on multiple Python versions
- **integration-tests.yml** - Run full integration test suite

### Deployment Architecture

The Firebird project uses a split deployment model:

1. **Firebird Event Display Application** - Hosted on https://seeeic.org (separate server)
2. **VitePress Documentation** - Deployed to https://eic.github.io/firebird/ via GitHub Pages

### GitHub Pages Deployment (Documentation)

The `docs.yaml` workflow handles documentation deployment:
1. Triggered on push to `main` branch (when `docs/` changes) or manually via `workflow_dispatch`
2. Builds VitePress documentation from `docs/` directory
3. Deploys to https://eic.github.io/firebird/

To build documentation locally:
```bash
cd docs
npm install
npm run build      # Build for production
npm run dev        # Development server with hot reload
```

## Working with ROOT Files

Firebird supports ROOT geometry and event files through pyrobird:

```bash
# Extract geometry from ROOT file
pyrobird geo detector.root

# Convert EDM4eic events to DEX format
pyrobird convert simulation.edm4hep.root output.json

# Server can convert events on-the-fly
# GET /api/v1/convert/edm4eic/5?filename=path/to/file.edm4eic.root
```

## Key Configuration Files

- `firebird-ng/angular.json` - Angular build configuration, bundle size limits
- `firebird-ng/package.json` - Dependencies, npm scripts
- `firebird-ng/tsconfig.json` - TypeScript compiler settings (strict mode)
- `pyrobird/pyproject.toml` - Python packaging, dependencies, metadata
- `dd4hep-plugin/CMakeLists.txt` - C++ build system, DD4Hep/Geant4 integration
- `.github/workflows/` - CI/CD pipeline definitions
- `firebird-ng/src/assets/config.jsonc` - Runtime configuration (geometry, server URLs)

## Performance Considerations

1. **BVH acceleration** - Enable for large geometries (automatic in three.service)
2. **Bundle size limits** - Keep production builds under 2MB (warning at 2MB, error at 5MB)
3. **Lazy loading** - Use Angular route-based code splitting
4. **Geometry merging** - Merge similar geometry for reduced draw calls
5. **Time-based filtering** - Painters only render objects in current time range
6. **Web Workers** - Geometry loading happens in a worker thread
   (geometry-loader.worker.ts). DEX event parsing runs on the main thread.

## Common Development Scenarios

### Adding a New Event Component Type

Follow `packages/firebird-example-extension/` (the working template):

1. Create a class extending `EventPiece` with `toDexObject()` and a factory
   implementing `EventPieceFactory` (plain TS, worker-safe; adopt columns as
   typed arrays, check lengths against `count` loudly)
2. Create a painter extending `EventPiecePainter` (avoid `LineLoop` —
   WebGPURenderer silently skips it; use closed `Line` strips)
3. Export a feature: `withMyType() = firebirdFeatures(withEventPiece(MyFactory),
   withLazyPainter(MyPiece.type, () => import('./my.painter').then(m => m.MyPainter)))`
4. Add the feature to `provideFirebird(...)` in `app.config.ts`
5. Update pyrobird conversion if needed

### Modifying DD4Hep Trajectory Filtering

1. Edit steering file (e.g., `dd4hep-plugin/firebird_steering.py`)
2. Adjust parameters: `MomentumMin`, `VertexZMin/Max`, `StepCut`, `SaveParticles` (PDG codes)
3. Rebuild if modifying C++ code: `cd dd4hep-plugin/build && make && make install`

### Adding a New Backend Endpoint

1. Add route to `pyrobird/server/__init__.py`
2. Implement handler function
3. Add tests in `pyrobird/tests/unit_tests/`
4. Consider security implications (file access, CORS)
5. Update API documentation in README

### Debugging Visualization Issues

1. Check browser console for Three.js errors
2. Use Performance Stats component (toggle in UI)
3. Verify DEX format with sample files
4. Check painter configuration in scene tree
5. Use raycasting component to inspect object properties
6. Enable verbose logging: `ng serve --verbose`

## Important Notes

- **Bundle optimization:** Angular build enforces size limits. Use `ng build --stats-json` to analyze.
- **ROOT file compatibility:** pyrobird uses Uproot (pure Python). Some complex ROOT types may require conversion.
- **XRootD support:** Install with `pip install pyrobird[xrootd]` for remote file access.
- **Docker for DD4Hep:** EIC provides `eicweb/eic_xl:nightly` with full HENP stack.
- **Git LFS:** This repository may use Git LFS for large binary files.
- **Documentation:** User-facing documentation is in `docs/` (VitePress site, deployed to https://eic.github.io/firebird/). Key developer pages: `docs/extensions.md`, `docs/command-bus.md`; user pages: `docs/deep-links.md`, tutorials.
