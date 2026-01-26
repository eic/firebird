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

This is a **monorepo** containing three interdependent components:

- **firebird-ng/** - Angular 20 frontend (TypeScript, Three.js, RxJS)
- **pyrobird/** - Python Flask backend (file server, ROOT conversion)
- **dd4hep-plugin/** - C++ Geant4/DD4Hep plugin (trajectory extraction during simulation)

The documentation source lives in:
- **docs/** - VitePress documentation site (deployed to GitHub Pages)
- **firebird-ng/src/assets/doc** - Documentation embedded in the Angular application

## Common Development Commands

### Frontend (firebird-ng)

```bash
cd firebird-ng

# Development server with hot reload
ng serve                       # http://localhost:4200

# Testing
npm test                       # Interactive tests (Karma)
npm run test:headless          # CI mode (headless Chrome)
ng test --include='**/my-component.spec.ts'  # Run single test file

# Building
npm run build                 # Production build
npm run build:ghpages         # GitHub Pages deployment
npm run build:watch           # Watch mode for development

# Generate components (Angular CLI)
ng generate component component-name
ng generate service service-name
```

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

## High-Level Architecture

Firebird is made so that running frontend alone is sufficient for most use cases.
Backend serves for:
- some file conversions (e.g. working with xrootd, editing events, etc.)
- serving firebird locally for users
- using pip install for deployment


### Frontend Architecture (firebird-ng)

The Angular application uses a **service-oriented architecture** with clear separation of concerns:

#### Core Services Layer

- **three.service.ts** (3700+ lines) - Central Three.js orchestration
  - Scene setup (cameras, lights, rendering loop)
  - Raycasting for object selection
  - BVH (Bounding Volume Hierarchy) acceleration for performance
  - Clipping planes and measurement tools
  - Frame callbacks for animations

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

#### Data Model Layer

The **event group factory pattern** enables extensibility:

- `EventGroup` - Abstract base class for all event components
- `BoxHitGroup` - Tracker hits (3D boxes with energy/time)
- `PointTrajectoryGroup` - Particle trajectories (polylines)
- Component registry with `registerComponentFactory()` for custom types

To add a new component type:
1. Extend `EventGroup` and implement `toDexObject()`
2. Create a factory implementing `EventGroupFactory`
3. Register the factory at initialization

#### Painter System

Painters render event data to Three.js objects using **time-aware rendering**:

- `data-model-painter.ts` - Main orchestrator (filters by time range)
- `trajectory.painter.ts` - Particle tracks with smooth splines
- `box-hit.painter.ts` - Individual tracker hits
- `step-track.painter.ts` - Geant4 step-by-step trajectories

The system uses Angular signals for reactive time updates that automatically propagate through the painter hierarchy.

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

Standardized JSON format for event data interoperability:

```json
{
  "type": "firebird-dex-json",
  "version": "0.04",
  "origin": {
    "source": "filename.root",
    "by": "Pyrobird"
  },
  "events": [
    {
      "id": "event_0",
      "groups": [
        {
          "name": "BarrelHits",
          "type": "BoxTrackerHit",
          "hits": [{"pos": [x,y,z], "dim": [dx,dy,dz], "t": [t,dt], "ed": [e,de]}]
        },
        {
          "name": "CentralTracks",
          "type": "TrackerLinePointTrajectory",
          "lines": [{"points": [[x,y,z,t,dx,dy,dz,dt], ...], "params": [...]}]
        }
      ]
    }
  ]
}
```

**Key types:**
- `BoxTrackerHit` - 3D box hits with energy/time information
- `TrackerLinePointTrajectory` - Polyline trajectories with metadata
- Extensible via factory pattern for custom component types

## Important Architectural Patterns

### 1. Factory Pattern for Event Components

Component factories enable DEX deserialization without modifying core code. Register new types with `registerComponentFactory()` in appropriate initialization code (typically in the component's own file or a central registry).

### 2. Time-Aware Rendering

The painter system filters data by time range using Angular signals:
- `EventTime` signal propagates through painter hierarchy
- Components show/hide based on time range
- Tween.js enables smooth animations

### 3. BVH Acceleration

`three-mesh-bvh` provides fast raycasting for object selection:
- Lazy BVH computation on demand
- Frustum culling for performance
- Critical for large detector geometries

### 4. Service Singletons

Angular services are singletons managing global state:
- Scene management (three.service)
- Event data (data-model.service)
- Configuration (config.service)
- URL parameters (url.service)

### 5. Security by Configuration (pyrobird)

Restrictive defaults prevent unauthorized file access:
- Explicit opt-in for dangerous features
- Path traversal prevention
- CORS disabled by default

## Testing Infrastructure

### Frontend Testing
- **Framework:** Karma + Jasmine
- **CI:** GitHub Actions on every push/PR (Node.js 22, headless Chrome)
- Run tests: `npm test` or `npm run test:headless`

### Backend Testing
- **Framework:** pytest
- **CI:** GitHub Actions (Python 3.8-3.12)
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
- **Components:** Standalone Angular components (Angular 20)
- **Reactive programming:** RxJS and Angular signals
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
6. **Web Workers** - Event loading happens in worker thread (event-loader.worker.ts)

## Common Development Scenarios

### Adding a New Event Component Type

1. Create class extending `EventGroup` in `firebird-ng/src/app/model/`
2. Implement `toDexObject()` for serialization
3. Create factory class implementing `EventGroupFactory`
4. Register factory in appropriate initialization code
5. Create painter in `firebird-ng/src/app/painters/` to render component
6. Update pyrobird conversion if needed

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
- **Documentation:** User-facing documentation is in `docs/` (VitePress site) and also in `firebird-ng/src/assets/doc/` (embedded in app), including tutorials.
