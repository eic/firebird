/**
 * RenderView — one view of the shared three.js scene.
 *
 * ThreeService owns the single Scene, the renderer, and the one render loop.
 * A RenderView owns everything that is per-view: the DOM container it draws
 * into, its cameras (perspective + orthographic pair), the OrbitControls
 * bound to that container, the viewport/scissor rectangle inside the shared
 * canvas, and any overlays drawn on top of the view (e.g. the navigation
 * cube).
 *
 * The main display is view #0; a multi-view page (like the quad projection
 * view) adds more views over the same scene. Views are plain TS objects
 * created by `ThreeService.addView()` — no DI here.
 */

import {
  MathUtils,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { WebGPURenderer } from 'three/webgpu';
import { BehaviorSubject } from 'rxjs';

/**
 * Something drawn on top of a view after its scene render — an orientation
 * cube, axes, 2D annotations. Overlays render into the shared canvas and are
 * responsible for their own viewport handling (see `RenderView.viewportOf`
 * for backend-aware rectangle math).
 */
export interface ViewOverlay {
  /** Called every frame, after the view's scene render. */
  render(view: RenderView): void;
  /** Called when the view's size or position changed. */
  onViewResize?(view: RenderView): void;
  /** Called when the view moved to another DOM container (page switches). */
  onViewContainerChange?(view: RenderView): void;
  /** Called when the view or the overlay is removed. */
  dispose?(): void;
}

export interface RenderViewOptions {
  /** Shown in debug output and used to find views. */
  name: string;
  /**
   * The DOM element this view fills. Pointer input (controls, picking) is
   * listened on this element; the view's viewport rectangle tracks it.
   */
  container: HTMLElement;
  /** Start with the orthographic camera instead of the perspective one. */
  orthographic?: boolean;
  /**
   * Initial visible world height (world units) for an orthographic view.
   * Later zooming and resizing preserve the height/zoom relation.
   */
  orthoWorldHeight?: number;
  /**
   * Fixed view direction (unit vector from target toward the camera) with a
   * screen-up vector — used by projection views (top/front/right). When set,
   * controls allow pan/zoom but not rotation.
   */
  fixedDirection?: { direction: [number, number, number]; up: [number, number, number] };
}

/** Viewport rectangle in CSS pixels, plus the backend-aware y for three.js calls. */
export interface ViewportRect {
  /** Left edge relative to the canvas. */
  x: number;
  /** Y to pass to `renderer.setViewport`/`setScissor` (origin differs per backend). */
  y: number;
  width: number;
  height: number;
}

const SCENE_RADIUS = 15000;
const POLE_LIMIT = Math.cos(15 * Math.PI / 180);

export class RenderView {
  readonly name: string;
  container: HTMLElement;

  perspectiveCamera: PerspectiveCamera;
  orthographicCamera: OrthographicCamera;
  /** The active camera (perspective or orthographic). */
  camera: PerspectiveCamera | OrthographicCamera;
  /** Emits true when the active camera is the perspective one. */
  cameraMode$ = new BehaviorSubject<boolean>(true);

  controls: OrbitControls;

  /** Fixed-projection views (top/front/right) disable rotation. */
  readonly isRotationLocked: boolean;

  private renderer: WebGPURenderer;
  private overlays: ViewOverlay[] = [];

  /** Cached viewport rect; recomputed by updateViewport() on layout changes. */
  private viewport: ViewportRect = { x: 0, y: 0, width: 1, height: 1 };
  /** CSS-pixel size of the container, cached with the viewport. */
  private viewSize = { width: 1, height: 1 };

  private raycaster = new Raycaster();

  // Scratch vectors for pole re-anchoring (no per-frame allocation)
  private readonly poleOffset = new Vector3();
  private readonly poleScreenUp = new Vector3();

  constructor(renderer: WebGPURenderer, options: RenderViewOptions) {
    this.name = options.name;
    this.renderer = renderer;
    this.container = options.container;
    this.isRotationLocked = !!options.fixedDirection;

    // The startup view is the HENP top view: camera above the detector
    // looking down, beam (Z) pointing right on screen, X toward the top of
    // the screen — hence up = +X while looking along -Y. The up vector must
    // be set BEFORE OrbitControls is constructed: the controls capture the
    // up axis once, in their constructor.
    this.perspectiveCamera = new PerspectiveCamera(60, 1, 10, 40000);
    this.perspectiveCamera.position.set(0, 7000, 0);
    this.perspectiveCamera.up.set(1, 0, 0);

    const orthoSize = (options.orthoWorldHeight ?? 2000) / 2;
    this.orthographicCamera = new OrthographicCamera(
      -orthoSize, orthoSize,
      orthoSize, -orthoSize,
      // Negative near plane: orthographic views must see objects behind the
      // camera position (the camera sits inside the world bounds).
      -10000, 40000
    );
    this.orthographicCamera.position.copy(this.perspectiveCamera.position);
    this.orthographicCamera.up.copy(this.perspectiveCamera.up);
    this.orthographicCamera.lookAt(0, 0, 0);

    this.camera = options.orthographic ? this.orthographicCamera : this.perspectiveCamera;
    this.cameraMode$.next(!options.orthographic);

    // Controls listen on the container, not the canvas: in multi-view pages
    // the shared canvas sits behind the view containers and never receives
    // pointer events (in the single-view page canvas events bubble up).
    this.controls = new OrbitControls(this.camera, this.container);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = false;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = SCENE_RADIUS * 0.05;
    this.controls.maxDistance = SCENE_RADIUS * 5;
    this.camera.far = this.controls.maxDistance * 1.1;
    this.camera.updateProjectionMatrix();

    if (options.fixedDirection) {
      const { direction, up } = options.fixedDirection;
      this.setCameraUp(new Vector3(...up));
      const distance = 7000;
      this.camera.position.set(
        direction[0] * distance, direction[1] * distance, direction[2] * distance);
      this.camera.lookAt(0, 0, 0);
      this.controls.enableRotate = false;
      // Pan in screen space so axis-locked projections pan intuitively
      this.controls.screenSpacePanning = true;
    } else {
      // OrbitControls cannot rotate across the poles of its up axis (the
      // polar angle is hard-clamped). With the top view as the primary
      // orientation that clamp is a wall in the middle of normal navigation,
      // so the orbit frame is re-anchored whenever the camera gets near a
      // pole: the up axis is replaced by the current screen-up, which keeps
      // the visible roll identical while moving the poles 90 degrees away.
      // The world may end up rolled after long free tumbles — the navigation
      // cube and view presets restore canonical orientations.
      this.controls.addEventListener('change', () => this.keepOrbitAwayFromPoles());
    }

    this.controls.update();
  }

  /** Re-parents the view to another DOM element (page/route switches). */
  setContainer(container: HTMLElement): void {
    if (this.container === container) return;
    this.container = container;
    this.controls.connect(container);
    for (const overlay of this.overlays) {
      overlay.onViewContainerChange?.(this);
    }
  }

  // -------------------------------------------------------------------------
  // Size and viewport
  // -------------------------------------------------------------------------

  /**
   * Recomputes the viewport rectangle of this view inside the shared canvas
   * and updates the camera projections for the new aspect ratio. Call after
   * any layout change (resize, pane toggle, view add/remove) — not per frame.
   */
  updateViewport(): void {
    const canvas = this.renderer.domElement;
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;

    if (this.container === canvas.parentElement) {
      // Single-view fast path: the canvas fills this container directly.
      this.viewport = { x: 0, y: 0, width, height };
    } else {
      const rect = this.container.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const x = rect.left - canvasRect.left;
      const yTop = rect.top - canvasRect.top;
      // WebGL's viewport origin is bottom-left, WebGPU's is top-left.
      const isWebGPU = (this.renderer as { isWebGPURenderer?: boolean }).isWebGPURenderer === true;
      const y = isWebGPU ? yTop : canvas.clientHeight - (yTop + rect.height);
      this.viewport = { x, y, width: rect.width, height: rect.height };
    }

    this.viewSize = { width, height };

    this.perspectiveCamera.aspect = width / Math.max(1, height);
    this.perspectiveCamera.updateProjectionMatrix();

    if (this.camera === this.orthographicCamera) {
      const ortho = this.orthographicCamera;
      // Preserve the visible world height (frustum height / zoom) across
      // resizes so resizing does not change the scale, only the crop.
      const worldScreenHeight = (ortho.top - ortho.bottom) / Math.max(1e-9, ortho.zoom);
      const unitsPerPixel = worldScreenHeight / Math.max(1, height);
      const halfW = (width * unitsPerPixel) / 2;
      const halfH = (height * unitsPerPixel) / 2;
      ortho.left = -halfW; ortho.right = halfW;
      ortho.top = halfH; ortho.bottom = -halfH;
      ortho.updateProjectionMatrix();
    }

    this.controls.update();

    for (const overlay of this.overlays) {
      overlay.onViewResize?.(this);
    }
  }

  /** The view's rectangle inside the canvas, y ready for `renderer.setViewport`. */
  get viewportRect(): Readonly<ViewportRect> {
    return this.viewport;
  }

  /** CSS-pixel size of the view container. */
  get size(): Readonly<{ width: number; height: number }> {
    return this.viewSize;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /**
   * Renders this view's rectangle: viewport + scissor to the view rect, scene
   * render with the view camera, then overlays. `ThreeService`'s loop calls
   * this in multi-view mode; the single-view fast path renders directly
   * without viewport state changes (identical to a plain full-canvas render).
   */
  renderTo(renderer: WebGPURenderer, scene: import('three').Scene): void {
    const { x, y, width, height } = this.viewport;
    renderer.setViewport(x, y, width, height);
    renderer.setScissor(x, y, width, height);
    renderer.render(scene, this.camera);
    this.renderOverlays();
  }

  /** Runs the overlay renders (the loop calls this after the scene render). */
  renderOverlays(): void {
    for (const overlay of this.overlays) {
      overlay.render(this);
    }
  }

  /** Adds an overlay drawn after this view's scene render. */
  addOverlay(overlay: ViewOverlay): void {
    if (!this.overlays.includes(overlay)) {
      this.overlays.push(overlay);
    }
  }

  removeOverlay(overlay: ViewOverlay): void {
    const index = this.overlays.indexOf(overlay);
    if (index !== -1) {
      this.overlays.splice(index, 1);
    }
  }

  // -------------------------------------------------------------------------
  // Picking
  // -------------------------------------------------------------------------

  /**
   * Normalized device coordinates of a pointer event inside this view,
   * or null when the pointer is outside the view rectangle.
   */
  ndcFromEvent(event: { clientX: number; clientY: number }): Vector2 | null {
    const rect = this.container.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    const y = (event.clientY - rect.top) / Math.max(1, rect.height);
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return new Vector2(x * 2 - 1, -(y * 2 - 1));
  }

  /**
   * A raycaster aimed from this view's camera through the given pointer
   * event. Returns null when the pointer is outside the view.
   */
  raycasterFromEvent(event: { clientX: number; clientY: number }): Raycaster | null {
    const ndc = this.ndcFromEvent(event);
    if (!ndc) return null;
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.near = this.camera.near;
    this.raycaster.far = this.camera.far;
    return this.raycaster;
  }

  // -------------------------------------------------------------------------
  // Camera handling
  // -------------------------------------------------------------------------

  /**
   * Sets the camera up vector (kept in sync on both cameras) and refreshes
   * the up axis OrbitControls captured in its constructor — without the
   * refresh, orbiting keeps rotating around the old up. Used by camera view
   * presets and the viewport gizmo for top/bottom views and rolls.
   */
  setCameraUp(up: Vector3): void {
    this.perspectiveCamera.up.copy(up);
    this.orthographicCamera.up.copy(up);
    const controls = this.controls as unknown as {
      _quat?: Quaternion;
      _quatInverse?: Quaternion;
    };
    if (controls._quat) {
      controls._quat.setFromUnitVectors(up, new Vector3(0, 1, 0));
      controls._quatInverse?.copy(controls._quat).invert();
    }
  }

  /**
   * Re-anchors the orbit frame when the camera direction closes in on the
   * up-axis poles (see the controls 'change' listener in the constructor).
   * The new up is the exact current screen-up, so nothing visibly changes at
   * the moment of the switch.
   */
  private keepOrbitAwayFromPoles(): void {
    const camera = this.camera;
    const offset = this.poleOffset.subVectors(camera.position, this.controls.target);
    const distance = offset.length();
    if (!distance) return;

    offset.divideScalar(distance);
    // cos of the angle between the view direction and the up axis;
    // |cos| > cos(15°) means the camera is within 15° of a pole.
    if (Math.abs(offset.dot(camera.up)) < POLE_LIMIT) return;

    const screenUp = this.poleScreenUp
      .copy(camera.up)
      .addScaledVector(offset, -offset.dot(camera.up));
    if (screenUp.lengthSq() < 1e-12) return;

    this.setCameraUp(screenUp.normalize());
  }

  /**
   * Toggles between the perspective and orthographic cameras, preserving the
   * viewing direction and the visible world height (so nothing jumps).
   */
  toggleOrthographicView(useOrtho: boolean): void {
    const target = this.controls.target.clone();
    const vw = this.viewSize.width || 1;
    const vh = this.viewSize.height || 1;

    // Current visible world height at the target, from whichever camera is active
    let worldScreenHeight: number;
    if ((this.camera as PerspectiveCamera).isPerspectiveCamera) {
      const persp = this.camera as PerspectiveCamera;
      const dist = persp.position.distanceTo(target);
      const fovRad = MathUtils.degToRad(persp.fov);
      worldScreenHeight = 2 * dist * Math.tan(fovRad / 2);
    } else {
      const ortho = this.camera as OrthographicCamera;
      worldScreenHeight = (ortho.top - ortho.bottom) / Math.max(1e-9, ortho.zoom);
    }

    if (useOrtho) {
      const persp = this.perspectiveCamera;
      this.orthographicCamera.position.copy(persp.position);
      this.orthographicCamera.up.copy(persp.up);
      this.orthographicCamera.lookAt(target);

      const unitsPerPixel = worldScreenHeight / vh;
      const halfW = (vw * unitsPerPixel) / 2;
      const halfH = (vh * unitsPerPixel) / 2;
      this.orthographicCamera.left = -halfW;
      this.orthographicCamera.right = halfW;
      this.orthographicCamera.top = halfH;
      this.orthographicCamera.bottom = -halfH;
      this.orthographicCamera.zoom = 1; // scale is encoded in the frustum

      // Generous near/far span: ortho views must not clip world-sized geometry
      const dist = persp.position.distanceTo(target);
      const clipSpan = Math.max(1e6, dist * 10);
      this.orthographicCamera.near = -clipSpan;
      this.orthographicCamera.far = clipSpan;

      this.orthographicCamera.updateProjectionMatrix();
      this.orthographicCamera.up.copy(this.camera.up);
      this.camera = this.orthographicCamera;
    } else {
      // Back to perspective: choose the distance that keeps the same visible height
      const persp = this.perspectiveCamera;
      const fovRad = MathUtils.degToRad(persp.fov);
      const dist = (worldScreenHeight / 2) / Math.tan(fovRad / 2);

      const dir = new Vector3().subVectors(this.camera.position, target).normalize();
      const newPos = new Vector3().copy(target).addScaledVector(dir, dist);

      persp.position.copy(newPos);
      persp.up.copy(this.camera.up);
      persp.lookAt(target);

      persp.near = Math.max(0.1, dist * 0.001);
      persp.far = Math.max(1000, dist * 1000);

      persp.updateProjectionMatrix();
      this.camera = persp;
    }

    this.controls.object = this.camera;
    this.controls.update();
    this.cameraMode$.next(!useOrtho);
  }

  dispose(): void {
    for (const overlay of this.overlays) {
      overlay.dispose?.();
    }
    this.overlays = [];
    this.controls.dispose();
  }
}
