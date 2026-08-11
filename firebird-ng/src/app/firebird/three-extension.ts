/**
 * The ThreeExtension contract: the narrow lifecycle interface through which
 * extensions hook the rendering machinery (scene lifecycle, frame loop).
 *
 * Boundary rule: if code turns *data* (event groups, fields, geometry) into
 * visuals, it is a painter — register it with `withPainter()`. If it hooks
 * the *machinery* — scene lifecycle, frame loop, input, services — it is a
 * ThreeExtension.
 */

import type { Type } from '@angular/core';
import type * as THREE from 'three';
import type { WebGPURenderer, ClippingGroup } from 'three/webgpu';
import type { Event as FbEvent } from '@firebird/core';
import type { RenderView, RenderViewOptions } from '../services/render-view';
import type { ClippedGeometrySlice } from '../services/geometry-slice';

/**
 * Everything an extension needs to work with the scene. Handed to
 * `onSceneInit` strictly AFTER the async renderer initialization resolved —
 * extension authors never hand-roll "defer until ready" logic.
 *
 * The context hands out real three.js objects, never wrappers. An author who
 * wants three.js verbatim builds a `Raycaster` from `camera` + pointer math.
 */
export interface SceneContext {
  scene: THREE.Scene;
  /** Detector geometry container. Clipping applies here — never to sceneEvent. */
  sceneGeometry: ClippingGroup;
  /** Event data container. Never clipped. */
  sceneEvent: THREE.Group;
  /** Lights, axes, gizmos, measurement markers. */
  sceneHelpers: THREE.Group;
  /** The active camera (perspective or orthographic). */
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  renderer: WebGPURenderer;
  /** Attach input listeners here; do not query the DOM for the canvas. */
  canvas: HTMLCanvasElement;
  /**
   * The render views sharing this scene. Live list: multi-view pages add and
   * remove views at runtime. `views[0]` is always the main view.
   */
  readonly views: readonly RenderView[];
  /**
   * The main view — the display page's camera/controls. Per-view overlays
   * (like the navigation cube) attach here via `mainView.addOverlay()`.
   */
  readonly mainView: RenderView;
  /** Adds a view of the shared scene (see RenderViewOptions for the contract). */
  addView(options: RenderViewOptions): RenderView;
  /** Removes a view added with addView. The main view cannot be removed. */
  removeView(view: RenderView): void;
  /**
   * The independently clipped geometry copy for projection views, or null
   * when no view uses one. Create with `createGeometrySlice()`, give added
   * views their own cut via the `geometrySlice` + `clipPlane` view options,
   * and call `rebuildGeometrySlice()` after loading new geometry. See
   * ClippedGeometrySlice for the mechanism.
   */
  readonly geometrySlice: ClippedGeometrySlice | null;
  createGeometrySlice(): ClippedGeometrySlice;
  rebuildGeometrySlice(): void;
  removeGeometrySlice(): void;
  /**
   * Signal that you changed renderable state — the next animation frame
   * renders. The render loop is on-demand by default (config
   * `rendering.mode`): a mutation without an invalidate() shows up only
   * when something else triggers a render. Call it after mutating anything
   * the next frame must show. Cheap and idempotent.
   */
  invalidate(): void;
}

/**
 * Per-frame context passed to `onFrame` inside the render loop.
 * Keep `onFrame` cheap: no allocation, no per-frame polling of app state.
 *
 * Rule: `onFrame` is for animation only. State changes must travel through
 * signals/effects, never by polling inside the frame loop. Under the
 * default on-demand scheduling, `onFrame` runs only on frames that render;
 * an animation sustains itself by calling `invalidate()` from its update
 * (start it with one seed `invalidate()`), and the chain ends by itself
 * when the animation stops updating.
 */
export interface FrameContext {
  /** Milliseconds since the previous RENDERED frame. */
  deltaTime: number;
  renderer: WebGPURenderer;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  /** Same contract as SceneContext.invalidate. */
  invalidate(): void;
}

/**
 * Lifecycle interface for rendering-machinery extensions. All methods are
 * optional; implement only what you need. Registered with
 * `withThreeExtension(MyExtension)` — the class is instantiated through DI,
 * so `inject()` works in its constructor.
 */
export interface ThreeExtension {
  /** Called once, after the async ThreeService.init completed. */
  onSceneInit?(ctx: SceneContext): void;
  /** Called every frame before rendering. Keep it cheap. */
  onFrame?(ctx: FrameContext): void;
  /** Called when a new event (entry) was loaded and painted. */
  onEventLoaded?(event: FbEvent): void;
  /** Guaranteed cleanup on display teardown. Remove listeners and objects here. */
  onDispose?(): void;
}

/**
 * Loader shape for heavy extensions that must not sit in the initial bundle:
 * `withLazyThreeExtension(() => import('./vr').then(m => m.VrExtension))`.
 * The bundler splits each lazy extension into its own chunk; the extension
 * class itself is written identically in both cases.
 */
export type LazyThreeExtensionLoader = () => Promise<Type<ThreeExtension>>;
