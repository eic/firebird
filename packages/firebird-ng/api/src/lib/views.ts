/**
 * The render view contracts: what an extension sees of the views that draw
 * the shared scene, the options for adding one, view overlays, and the
 * camera-layer routing.
 *
 * Interfaces and plain constants only: this module is part of the initial
 * bundle and imports three.js types, never three.js values.
 */

import type { OrthographicCamera, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { ClippingGroup } from 'three/webgpu';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraLimits, Vec3Tuple } from './tokens';

// ---------------------------------------------------------------------------
// Camera-layer routing
// ---------------------------------------------------------------------------
//
// Every camera renders layer 0 (helpers, lights) and EVENT_DATA_LAYER. The
// detector geometry stays on layer 0 until a geometry slice exists; then the
// original geometry moves to GEOMETRY_MAIN_LAYER (the main view enables it)
// and the slice copy sits on GEOMETRY_SLICE_LAYER (views created with
// `geometrySlice` enable it).

/** Original detector geometry while a geometry slice exists: rendered by the main view. */
export const GEOMETRY_MAIN_LAYER = 1;
/** The geometry slice copy: rendered by views created with `geometrySlice`. */
export const GEOMETRY_SLICE_LAYER = 2;
/**
 * Event data: everything under `sceneEvent`. Every view renders it; a
 * tracks-on-top view renders it in a second pass over a cleared depth
 * buffer. Painted objects are routed here by the display; objects an
 * extension adds go through `SceneContext.addEventObject()`. The lights
 * carry this layer too: both passes must collect the same light set, or
 * every shared render object rebuilds each frame.
 */
export const EVENT_DATA_LAYER = 3;

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** A camera pose: where the camera is, what it orbits, and its screen up. */
export interface CameraPose {
  position: Vec3Tuple;
  target: Vec3Tuple;
  up: Vec3Tuple;
}

/** Viewport rectangle in CSS pixels, top-left origin, as three's WebGPURenderer takes it. */
export interface ViewportRect {
  /** Left edge relative to the canvas. */
  x: number;
  /** Top edge relative to the canvas; pass to `renderer.setViewport`/`setScissor` as is. */
  y: number;
  width: number;
  height: number;
}

/**
 * The independently clipped copy of the detector geometry that projection
 * views cut (see `SceneContext.createGeometrySlice()`).
 *
 * @experimental Edits to the original geometry after a load (visibility,
 * materials) do not reach the copy until `rebuildGeometrySlice()`.
 */
export interface GeometrySlice {
  /** The clipping group holding the copy; the display adds it to the scene. */
  readonly group: ClippingGroup;
  /** The one clip plane, written by each view with its own `clipPlane` before it renders. */
  readonly plane: Plane;
}

/**
 * One view of the shared scene: a DOM container, a perspective and an
 * orthographic camera, orbit controls on that container, and a rectangle
 * of the shared canvas. The display's own view is `SceneContext.mainView`;
 * `SceneContext.addView()` adds more.
 */
export interface RenderView {
  /** The name given at creation ('main' for the display's view). */
  readonly name: string;
  /**
   * The element the view fills. Pointer input (controls, picking) arrives
   * here, never on the shared canvas; the element changes when the view
   * moves to another page (`ViewOverlay.onViewContainerChange`).
   */
  readonly container: HTMLElement;
  /** The active camera (perspective or orthographic). */
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly perspectiveCamera: PerspectiveCamera;
  readonly orthographicCamera: OrthographicCamera;
  /** Orbit controls bound to `container`. */
  readonly controls: OrbitControls;
  /** True for a view created with `fixedDirection`: it pans and zooms, never rotates. */
  readonly isRotationLocked: boolean;
  /**
   * This view's geometry cut in world space, or null. Mutate its normal and
   * constant to move the cut, then set `dirty`.
   *
   * @experimental Works only on a view created with `geometrySlice`.
   */
  readonly clipPlane: Plane | null;
  /** Draws event data over geometry regardless of depth (two render passes). */
  tracksOnTop: boolean;
  /**
   * True when this view needs a new frame. Set it after changing a per-view
   * setting; the render loop clears it. `SceneContext.invalidate()` marks
   * every view.
   */
  dirty: boolean;
  /** The view's rectangle inside the canvas, y ready for `renderer.setViewport`. */
  readonly viewportRect: Readonly<ViewportRect>;
  /** CSS-pixel size of the view container. */
  readonly size: Readonly<{ width: number; height: number }>;
  /** Adds an overlay drawn after this view's scene render. */
  addOverlay(overlay: ViewOverlay): void;
  /** Removes an overlay and calls its `dispose()`. */
  removeOverlay(overlay: ViewOverlay): void;
  /**
   * Sets the screen up vector of both cameras and resyncs the orbit
   * controls, which capture the up axis once at construction.
   */
  setCameraUp(up: Vector3): void;
  /** Normalized device coordinates of a pointer event inside this view; null outside it. */
  ndcFromEvent(event: { clientX: number; clientY: number }): Vector2 | null;
  /** A raycaster through the pointer position for this view's camera; null outside the view. */
  raycasterFromEvent(event: { clientX: number; clientY: number }): Raycaster | null;
}

/**
 * Something drawn on top of a view after its scene render: an orientation
 * cube, axes, 2D annotations. Overlays render into the shared canvas and set
 * their own viewport (`RenderView.viewportRect`); restore what you change.
 * A render that throws removes the overlay.
 */
export interface ViewOverlay {
  /** Called every rendered frame, after the view's scene render. */
  render(view: RenderView): void;
  /** Called when the view's size or position changed. */
  onViewResize?(view: RenderView): void;
  /** Called when the view moved to another DOM container (page switches). */
  onViewContainerChange?(view: RenderView): void;
  /** Called when the view or the overlay is removed. */
  dispose?(): void;
}

/** Options of `SceneContext.addView()`. */
export interface RenderViewOptions {
  /** Shown in debug output and used to find views. */
  name: string;
  /**
   * The element this view fills. It must sit above the shared canvas;
   * pointer input is listened on it and the viewport rectangle tracks it.
   */
  container: HTMLElement;
  /** Start with the orthographic camera instead of the perspective one. */
  orthographic?: boolean;
  /**
   * Initial visible world height [mm] of an orthographic view. Zooming and
   * resizing keep the height/zoom relation.
   */
  orthoWorldHeight?: number;
  /**
   * Fixed view direction (unit vector from the target toward the camera)
   * and screen up, for projection views. The controls pan and zoom but do
   * not rotate.
   */
  fixedDirection?: { direction: [number, number, number]; up: [number, number, number] };
  /** Extra camera layers this view renders, besides layer 0 and EVENT_DATA_LAYER. */
  extraLayers?: number[];
  /**
   * The geometry slice this view renders instead of the original geometry
   * (its camera gets GEOMETRY_SLICE_LAYER). Views sharing the slice each
   * write their own `clipPlane` into it before they render.
   *
   * @experimental See `GeometrySlice`.
   */
  geometrySlice?: GeometrySlice;
  /**
   * This view's geometry cut in world space; requires `geometrySlice`. The
   * visible side is `normal . p + constant >= 0`.
   *
   * @experimental See `GeometrySlice`.
   */
  clipPlane?: { normal: [number, number, number]; constant: number };
  /** Draw event data over geometry regardless of depth (see `RenderView.tracksOnTop`). */
  tracksOnTop?: boolean;
  /** The camera pose at construction. Default: the top view, 7 m above the origin. */
  startPose?: CameraPose;
  /** Orbit distance limits [mm]. Default: the display's current limits. */
  distanceLimits?: CameraLimits;
}
