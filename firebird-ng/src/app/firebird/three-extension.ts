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
   * Signal that you changed renderable state.
   *
   * Currently a no-op: the render loop runs continuously. It is part of the
   * contract so that extensions written correctly today keep working
   * unmodified if the loop later switches to render-on-demand.
   * Call it after mutating anything the next frame must show.
   */
  invalidate(): void;
}

/**
 * Per-frame context passed to `onFrame` inside the render loop.
 * Keep `onFrame` cheap: no allocation, no per-frame polling of app state.
 *
 * Rule: `onFrame` is for animation only. State changes must travel through
 * signals/effects, never by polling inside the frame loop — polling breaks
 * silently if the loop ever goes render-on-demand.
 */
export interface FrameContext {
  /** Milliseconds since the previous frame. */
  deltaTime: number;
  renderer: WebGPURenderer;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  /** Same contract as SceneContext.invalidate — documented no-op for now. */
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
