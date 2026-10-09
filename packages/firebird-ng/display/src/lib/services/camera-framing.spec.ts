/**
 * Camera framing: what no pack pins derives from the loaded geometry's
 * bounding sphere (orbit limits; the home view while the camera has not
 * moved), and what a pack pins (a home pose and limits) stays exactly as
 * pinned. Presets come from the registry; face views keep the orbit
 * target and distance.
 */
import { TestBed } from '@angular/core/testing';
import { BoxGeometry, Group, Mesh } from 'three';
import { ThreeService } from './three.service';
import { PerfService } from './perf.service';
import { RenderViewImpl } from './render-view';
import { withCameraLimits, withCameraPreset, type CameraPreset } from '@dexvis/firebird-ng/api';
import { withStandardCameraPresets } from '@dexvis/firebird-ng';

/** The private members these specs set up instead of a WebGPU init. */
type ThreeInternals = {
  views: RenderViewImpl[];
  sceneGeometry: Group;
  initialized: boolean;
  pinnedHomePose: () => RenderViewImpl['startPose'] | undefined;
  cameraLimits: { minDistance: number; maxDistance: number };
  scheduleGeometryBvh: () => void;
};

/** A pack's pinned home view: a top view from 7 m with x up. */
const PINNED_HOME: CameraPreset = { name: 'home', position: [0, 7000, 0], target: [0, 0, 0], up: [1, 0, 0] };

/** A ThreeService with a real main view over a fake renderer, and a 2 m cube as geometry. */
function setup(providers: unknown[]) {
  TestBed.configureTestingModule({
    providers: [ThreeService, { provide: PerfService, useValue: { updateStats: () => undefined } }, ...providers as never[]],
  });
  const service = TestBed.inject(ThreeService);
  const internals = service as unknown as ThreeInternals;
  const renderer = { domElement: document.createElement('canvas') } as unknown as ConstructorParameters<typeof RenderViewImpl>[0];
  const main = new RenderViewImpl(renderer, {
    name: 'main',
    container: document.createElement('div'),
    startPose: internals.pinnedHomePose(),
    distanceLimits: internals.cameraLimits,
  });
  internals.views = [main];
  internals.sceneGeometry = new Group();
  internals.initialized = true;
  internals.scheduleGeometryBvh = () => undefined;
  const loadCube = () => {
    internals.sceneGeometry.add(new Mesh(new BoxGeometry(2000, 2000, 2000)));
    internals.sceneGeometry.updateMatrixWorld(true);
    service.geometryChanged();
  };
  return { service, main, loadCube };
}

describe('camera framing', () => {
  const cubeRadius = Math.sqrt(3) * 1000;

  it('without pins: derives the limits from the geometry and frames it from the home direction', () => {
    const { main, loadCube } = setup([...withStandardCameraPresets().providers]);
    expect(main.isAtStartPose()).toBe(true);
    loadCube();

    expect(main.controls.minDistance).toBeCloseTo(0.05 * cubeRadius);
    expect(main.controls.maxDistance).toBeCloseTo(5 * cubeRadius);
    expect(main.camera.far).toBeCloseTo(5.5 * cubeRadius);
    // Top view, the sphere fitting the 60 degree field of view: r / sin(30)
    expect(main.camera.position.y).toBeCloseTo(2 * cubeRadius);
    expect(main.controls.target.length()).toBeCloseTo(0);
    expect(main.camera.up.toArray()).toEqual([1, 0, 0]);
  });

  it('without pins: leaves a camera the user already moved where it is', () => {
    const { main, loadCube } = setup([...withStandardCameraPresets().providers]);
    main.camera.position.set(100, 200, 300);
    loadCube();
    expect(main.camera.position.toArray()).toEqual([100, 200, 300]);
    expect(main.controls.maxDistance).toBeCloseTo(5 * cubeRadius);
  });

  it('with a pinned home and limits: starts at the pinned home and keeps pose and limits after a load', () => {
    const { main, loadCube } = setup([
      ...withStandardCameraPresets().providers,
      ...withCameraPreset(PINNED_HOME).providers,
      ...withCameraLimits({ minDistance: 750, maxDistance: 75000 }).providers,
    ]);
    // Rounded: OrbitControls leaves sub-nanometer noise on the exact pose
    const roundedPosition = () => main.camera.position.toArray().map(value => Math.round(value) + 0);
    expect(roundedPosition()).toEqual([0, 7000, 0]);
    expect(main.camera.far).toBe(82500);
    loadCube();
    expect(roundedPosition()).toEqual([0, 7000, 0]);
    expect([main.controls.minDistance, main.controls.maxDistance, main.camera.far]).toEqual([750, 75000, 82500]);
  });

  it('a face preset keeps the orbit target and distance; a fixed pose sets all three', () => {
    const { service, main } = setup([...withStandardCameraPresets().providers]);
    main.controls.target.set(0, 0, 1000);
    main.camera.position.set(0, 3000, 1000);
    service.applyCameraPreset({ name: 'front', direction: [-1, 0, 0], up: [0, 1, 0] });
    expect(main.camera.position.toArray().map(value => Math.round(value) + 0)).toEqual([-3000, 0, 1000]);
    expect(main.camera.up.toArray()).toEqual([0, 1, 0]);

    service.applyCameraPreset({ name: 'downstream', position: [8000, 7500, 40000], target: [0, 0, 30000], up: [0, 1, 0] });
    expect(main.controls.target.toArray()).toEqual([0, 0, 30000]);
    expect(main.camera.position.toArray().map(value => Math.round(value) + 0)).toEqual([8000, 7500, 40000]);
  });
});
