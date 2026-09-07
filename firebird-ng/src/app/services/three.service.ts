import { Injectable, Injector, NgZone, OnDestroy, inject } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  HemisphereLight,
  DirectionalLight,
  AmbientLight,
  PointLight,
  SpotLight,
  Frustum,
  Matrix4,
  Camera,
  Scene, Mesh
} from 'three';
import { WebGPURenderer, ClippingGroup, NodeMaterial } from 'three/webgpu';
import {PerfService} from "./perf.service";
import {BehaviorSubject, Subject} from "rxjs";

/**
 * Workaround for a three.js (r183) clipping bug with classic materials.
 *
 * For non-node materials (MeshLambertMaterial etc.) the renderer builds a
 * TEMPORARY NodeMaterial for every shader build (NodeLibrary.fromMaterial) and
 * NodeMaterial.setupHardwareClipping stores its `hardwareClipping = true`
 * decision on that temporary. At draw time RenderObject.hardwareClippingPlanes
 * reads the flag from the ORIGINAL material, finds it unset, and never enables
 * the GPU clip distances — so union-mode clipping planes
 * (ClippingGroup.clipIntersection = false: the wedge >= 180 deg and the Z
 * plane) silently do not clip, while intersection-mode planes (fragment-shader
 * path, the pie wedge < 180 deg) work.
 *
 * Worse, ClippingNode reads `builder.material.hardwareClipping` — the CLASSIC
 * material again — where the flag is `undefined`; its fragment-shader
 * union-plane loop is guarded by `hardwareClipping === false`, so with
 * `undefined` the loop is skipped too and union planes are dropped from both
 * paths. (The intersection-plane loop has no such guard, which is why wedge
 * clipping below 180 degrees worked all along.)
 *
 * The patch (a) disables the hardware-clipping shortcut, forcing union planes
 * through the same fragment-shader path on WebGPU and the WebGL2 fallback,
 * and (b) defaults `hardwareClipping` to `false` on every classic material so
 * the guard sees a real boolean. Remove when three resolves node materials
 * consistently for classic materials.
 */
let hardwareClippingPatched = false;
function patchThreeHardwareClippingBug(): void {
  if (hardwareClippingPatched) return;
  hardwareClippingPatched = true;
  (NodeMaterial.prototype as unknown as { setupHardwareClipping: (builder: unknown) => void }).setupHardwareClipping =
    function (this: { hardwareClipping: boolean }) { this.hardwareClipping = false; };
  (THREE.Material.prototype as unknown as { hardwareClipping: boolean }).hardwareClipping = false;
}

import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree, MeshBVH, MeshBVHHelper
} from 'three-mesh-bvh';

import {THREE_EXTENSIONS, LAZY_THREE_EXTENSIONS} from '../firebird/tokens';
import type {ThreeExtension, SceneContext, FrameContext} from '../firebird/three-extension';
import type {Event as FbEvent} from '@firebird/core';
import {RenderView, RenderViewOptions} from './render-view';
import {ClippedGeometrySlice, GEOMETRY_MAIN_LAYER, EVENT_DATA_LAYER} from './geometry-slice';
import {ConfigService} from './config.service';



@Injectable({
  providedIn: 'root',
})
export class ThreeService implements OnDestroy {


  /** Three.js core components */
  public scene!: THREE.Scene;
  /** Z clipping wrapper — parent of sceneGeometry, never accessed externally */
  private zClippingGroup!: ClippingGroup;
  /** Angular (wedge) clipping — geometry is added here */
  public sceneGeometry!: ClippingGroup;
  public sceneEvent!: THREE.Group;
  public sceneHelpers!: THREE.Group;
  public renderer!: WebGPURenderer;

  /**
   * Views of the scene. views[0] is the MAIN view — the one the app-level
   * camera API below delegates to. Additional views (projection panels of the
   * quad view, extension-added views) share the one scene and render loop.
   */
  public views: RenderView[] = [];

  /** The primary view: the display page's camera and controls live here. */
  public get mainView(): RenderView {
    return this.views[0];
  }

  // Camera/controls delegation to the main view. Most of the app works with
  // "the" camera; multi-view pages address other views through `views`.
  public get controls(): OrbitControls {
    return this.mainView?.controls as OrbitControls;
  }

  public get perspectiveCamera(): THREE.PerspectiveCamera {
    return this.mainView?.perspectiveCamera as THREE.PerspectiveCamera;
  }

  public get orthographicCamera(): THREE.OrthographicCamera {
    return this.mainView?.orthographicCamera as THREE.OrthographicCamera;
  }

  /** The main view's active camera (perspective or orthographic). */
  public get camera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.mainView?.camera as THREE.PerspectiveCamera;
  }

  /** Emits true when the main view uses the perspective camera. */
  public get cameraMode$(): BehaviorSubject<boolean> {
    return this.mainView?.cameraMode$ as BehaviorSubject<boolean>;
  }

  /** The default axes helper, controllable via scene-helpers */
  public axesHelper!: THREE.AxesHelper;

  /** Optional clipping planes and logic (angular wedge clipping). */
  public clipPlanes = [
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  ];

  /** Z-axis clipping plane (perpendicular to Z). */
  public zClipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private zClippingEnabled = false;
  private angularClippingEnabled = false;
  /** Last clipping structure applied to the renderer; see updateClippingGroups. */
  private lastClippingStructure = '';

  /** The projection views' independently clipped geometry copy (see ClippedGeometrySlice). */
  public geometrySlice: ClippedGeometrySlice | null = null;

  /** Functions callbacks that help organize performance */
  public profileBeginFunc: (() => void) | null = null;
  public profileEndFunc: (() => void) | null = null;

  /** Animation loop control */
  private animationFrameId: number | null = null;
  private shouldRender = false;

  /**
   * Render scheduling (config key `rendering.mode`). On-demand is the
   * default: the RAF loop keeps ticking, but scene renders happen only when
   * something flagged a change. Dirty flags are SET by events, signals and
   * `invalidate()` calls — the loop only reads and clears them; it never
   * polls application state.
   */
  private continuousMode = false;
  /** "Render every view on the next frame" — set by invalidate(). */
  private renderRequested = true;
  /** Frames that actually rendered (idle gates and the perf box read this). */
  public renderedFrameCount = 0;

  /** Callbacks to run each frame before rendering. */
  private frameCallbacks: Array<() => void> = [];

  private clipIntersection: boolean = false;

  /** Initialization flag */
  private initialized: boolean = false;

  /** Extension system: contributions collected from DI.
   * Eager extensions are DI-instantiated here; lazy ones join after init. */
  private extensions: ThreeExtension[] = (inject(THREE_EXTENSIONS, {optional: true}) ?? []).slice();
  private lazyExtensionLoaders = inject(LAZY_THREE_EXTENSIONS, {optional: true}) ?? [];
  private injector = inject(Injector);
  /** Optional so plain `new ThreeService(...)` in tests works without DI. */
  private configService = inject(ConfigService, {optional: true});
  private sceneContext: SceneContext | null = null;
  private frameContext: FrameContext | null = null;
  private lastFrameStartTime = 0;

  /** Reference to the container element used for rendering */
  private containerElement!: HTMLElement;

  /** Lights */
  private ambientLight!: AmbientLight;
  private hemisphereLight!: HemisphereLight;
  private directionalLight!: DirectionalLight;
  private pointLight!: PointLight; // Optional
  private spotLight!: SpotLight; // Optional

  /** BVH wizard */
  public showBVHDebug: boolean = false;

   // Raycasting properties
  private isRaycastEnabled = false;

  /** Pointer handlers installed per view, kept so views can be removed cleanly. */
  private viewPointerHandlers = new Map<RenderView, {
    move: (event: PointerEvent) => void;
    down: (event: PointerEvent) => void;
    dblclick: (event: MouseEvent) => void;
  }>();


  // Track hover indicator
  // private hoverPoint: THREE.Mesh | null = null;

  // Track highlighted object for raycast feedback
  private highlightedObject: THREE.Object3D | null = null;
  private originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();

  // Events
  public trackHovered = new Subject<{track: THREE.Object3D, point: THREE.Vector3}>();
  public trackClicked = new Subject<{track: THREE.Object3D, point: THREE.Vector3, intersection: THREE.Intersection}>();

  // Raw hit point every frame (hover)
  public pointHovered = new Subject<THREE.Vector3>();

  // Distance ready after second point
  public distanceReady = new Subject<{ p1: THREE.Vector3; p2: THREE.Vector3; dist: number }>();

  // Toggle by UI when “3‑D Distance” checkbox is on
  public measureMode = false;

  // temp storage for first measure point
  private firstMeasurePoint: THREE.Vector3 | null = null;

  //  Measurement / hover state
  private hoverTimeout: number | null = null;
  private measurementPoints: THREE.Mesh[] = [];

  private frustumCuller = {
    frustum: new Frustum(),
    projScreenMatrix: new Matrix4(),

    updateFrustum(camera: Camera): void {
      this.projScreenMatrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    },

    cullMeshes(scene: Scene, camera: Camera): void {
      this.updateFrustum(camera);

      scene.traverse((object:any) => {
        if (object!=null && (object as any).isMesh) {
          // First check if object has bounds
          if (!object.geometry.boundingBox) {
            object.geometry.computeBoundingBox();
          }

          // For objects with BVH
          if (object.geometry.boundsTree) {
            // Use BVH for efficient culling
            const visible = object.geometry.boundsTree.shapecast({
              intersectsBounds: (box: THREE.Box3) => {
                return this.frustum.intersectsBox(box);
              }
            });
            console.log("Shapecast!");
            object.visible = visible ?? true;
          } else {
            // Fallback to standard bounding box check
            const box = new THREE.Box3().setFromObject(object);
            object.visible = this.frustum.intersectsBox(box);
          }
        }
      });
    }
  };


  constructor(
    private ngZone: NgZone,
    private perfService: PerfService) {
    // Empty constructor – initialization happens in init()

     // Apply mesh-bvh acceleration to improve raycasting performance
    THREE.Mesh.prototype.raycast = acceleratedRaycast;
    THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
    THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  }

  /**
   * Initializes the Three.js scene, camera, renderer, controls, and lights.
   * Must be called before any other method.
   * @param container A string representing the ID of the HTML element,
   *                  or the actual HTMLElement where the renderer will attach.
   */
  async init(container: string | HTMLElement): Promise<void> {

    let containerElement: HTMLElement;

    // Figure out the container
    if (typeof container === 'string') {
      const el = document.getElementById(container);
      if (!el) {
        throw new Error(`ThreeService Initialization Error: Container element #${container} not found.`);
      }
      containerElement = el;
    } else {
      containerElement = container;
    }

    // If already initialized once, warn but still re-attach the canvas.
    if (this.initialized) {
      console.warn('ThreeService has already been initialized. Re-attaching renderer...');
      this.attachRenderer(containerElement);
      return;
    }

    this.containerElement = containerElement;

    // 1) Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3f3f3f); // Dark grey background

    // Z clipping group (union mode) wraps the geometry group
    this.zClippingGroup = new ClippingGroup();
    this.zClippingGroup.name = 'ZClipping';
    this.zClippingGroup.enabled = false;
    this.zClippingGroup.clipIntersection = false; // union — always
    this.scene.add(this.zClippingGroup);

    // Angular (wedge) clipping group — geometry is added here
    this.sceneGeometry = new ClippingGroup();
    this.sceneGeometry.name = 'Geometry';
    this.sceneGeometry.enabled = false;
    this.zClippingGroup.add(this.sceneGeometry);

    // Event scene tree (regular Group — clipping does NOT apply to event data)
    this.sceneEvent = new THREE.Group();
    this.sceneEvent.name = 'Event';
    this.scene.add(this.sceneEvent);

    // Lights scene tree
    this.sceneHelpers = new THREE.Group();
    this.sceneHelpers.name = 'Helpers';
    this.scene.add(this.sceneHelpers);

    // Create renderer (WebGPU with automatic WebGL2 fallback)
    patchThreeHardwareClippingBug();
    this.renderer = new WebGPURenderer({ antialias: true , logarithmicDepthBuffer: true, stencil:true});
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    await this.renderer.init();

    // Append renderer to the container
    this.containerElement.appendChild(this.renderer.domElement);

    // The main view owns the cameras, OrbitControls, and viewport handling.
    // Its startup state is the HENP top view (see RenderView's constructor);
    // a startup command (?cmd=camera-preset:...) overrides it after init.
    const mainView = new RenderView(this.renderer, {
      name: 'main',
      container: this.containerElement,
    });
    this.views = [mainView];

    // Setup lights
    this.setupLights();

    // Add default objects
    this.addDefaultObjects();

    // (!) We set initialized here, as at this point all main objects are created and configured
    // It is important not to set this flag at the function end as functions, such as setSize will check the flag
    this.initialized = true;

    // Render scheduling mode. Normal config precedence applies, so a URL
    // (?config.rendering.mode=continuous), server config or the user can
    // override the on-demand default at any time.
    if (this.configService) {
      const modeProperty = this.configService.getConfigOrCreate<string>('rendering.mode', 'on-demand');
      const applyMode = (mode: string) => {
        this.continuousMode = mode === 'continuous';
        this.invalidate();
      };
      applyMode(modeProperty.value);
      modeProperty.subject.subscribe(applyMode); // root-singleton lifetime
    }

    // Apply any clipping state that was set by Angular effects before init completed
    this.updateClippingGroups();

    // ----------- POST INIT ------------------

    // Set initial size
    const width = this.containerElement.clientWidth;
    const height = this.containerElement.clientHeight;
    this.setSize(width, height);


    // Initialize the hover point
    // this.initHoverPoint();

    // Set up new raycasting handlers
    this.setupRaycasting();

    // Compute BVH for all existing meshes for fast raycasting
    this.setupBVH();

    // Start rendering
    this.startRendering();

    // Extension lifecycle: onSceneInit fires strictly AFTER the async renderer
    // init resolved — extensions never see a half-initialized scene. Lazy
    // extensions load after that, off the critical path.
    this.initExtensions();
    void this.activateLazyExtensions();
  }

  /** Builds the extension contexts and runs onSceneInit for eager extensions. */
  private initExtensions(): void {
    // The render-on-demand contract: extensions call invalidate() after
    // mutating renderable state, and the next frame renders. Extensions
    // that already followed the documented contract work unmodified.
    const invalidate = () => this.invalidate();
    const service = this;
    this.sceneContext = {
      scene: this.scene,
      sceneGeometry: this.sceneGeometry,
      sceneEvent: this.sceneEvent,
      sceneHelpers: this.sceneHelpers,
      // Getter: tracks perspective/orthographic camera toggling
      get camera() { return service.camera; },
      renderer: this.renderer,
      canvas: this.renderer.domElement,
      // Views: the list is live (multi-view pages add/remove views);
      // mainView is where per-view overlays like the navigation cube attach.
      get views() { return service.views as readonly RenderView[]; },
      get mainView() { return service.mainView; },
      addView: (options: RenderViewOptions) => this.addView(options),
      removeView: (view: RenderView) => this.removeView(view),
      get geometrySlice() { return service.geometrySlice; },
      createGeometrySlice: () => this.createGeometrySlice(),
      rebuildGeometrySlice: () => this.rebuildGeometrySlice(),
      removeGeometrySlice: () => this.removeGeometrySlice(),
      invalidate,
    };
    this.frameContext = {
      deltaTime: 0,
      renderer: this.renderer,
      get camera() { return service.camera; },
      invalidate,
    };
    for (const extension of this.extensions) {
      try {
        extension.onSceneInit?.(this.sceneContext);
      } catch (error) {
        console.error('[ThreeService] Extension onSceneInit failed:', extension, error);
      }
    }
  }

  /**
   * Resolves lazily-registered extensions (withLazyThreeExtension): loads the
   * chunk, instantiates the class through a child injector so `inject()` works
   * in its constructor, and gives late joiners the onSceneInit call they missed.
   * (v22 `injectAsync` targets already-provided tokens; lazy extension classes
   * arrive unprovided, hence the explicit child injector.)
   */
  private async activateLazyExtensions(): Promise<void> {
    for (const load of this.lazyExtensionLoaders) {
      try {
        const extensionClass = await load();
        const child = Injector.create({providers: [extensionClass], parent: this.injector});
        const extension = child.get(extensionClass);
        this.extensions.push(extension);
        if (this.sceneContext) {
          extension.onSceneInit?.(this.sceneContext);
        }
      } catch (error) {
        console.error('[ThreeService] Lazy extension activation failed:', error);
      }
    }
  }

  /** Forwards a newly loaded event to extensions (called by EventDisplayService). */
  notifyEventLoaded(event: FbEvent): void {
    for (const extension of this.extensions) {
      try {
        extension.onEventLoaded?.(event);
      } catch (error) {
        console.error('[ThreeService] Extension onEventLoaded failed:', extension, error);
      }
    }
    this.invalidate();
  }

  /**
   * If the service is already initialized (scene, camera, renderer exist),
   * you can re-attach the <canvas> to a container if it was removed or changed.
   * The main view follows the canvas host; camera state is preserved.
   */
  private attachRenderer(elem: HTMLElement): void {
    this.containerElement = elem;

    // If the canvas is not already in the DOM, re-append it.
    if (this.renderer?.domElement) {
      this.containerElement.appendChild(this.renderer.domElement);
    }
    if (this.mainView) {
      this.setMainViewContainer(elem);
    }
  }

  /**
   * Moves the main view (camera, controls, picking, overlays like the
   * navigation cube) to another DOM element. Multi-view pages call this to
   * place the main view into their layout cell; the display page's container
   * is restored through the normal init/re-attach path.
   */
  setMainViewContainer(container: HTMLElement): void {
    const view = this.mainView;
    if (!view) return;
    // Pointer handlers follow the container (remove BEFORE the switch —
    // removal targets the old element).
    this.removeRaycastHandlers(view);
    view.setContainer(container);
    this.installRaycastHandlers(view);
    view.updateViewport();
    this.invalidate();
  }

  /**
   * Re-parents the shared canvas into `host` without touching the main view's
   * container. Multi-view pages call this with a wrapper element that the
   * canvas fills, then place view containers (CSS grid cells) above it and
   * point views at them via `addView` / `mainView.setContainer`.
   */
  attachCanvasHost(host: HTMLElement): void {
    this.ensureInitialized('attachCanvasHost');
    this.containerElement = host;
    host.appendChild(this.renderer.domElement);
  }

  /**
   * Adds a view of the shared scene. The view renders inside `options.container`,
   * which must be positioned above the shared canvas (see attachCanvasHost).
   * Views share the scene and the one render loop; cameras, controls, picking
   * and overlays are per-view.
   */
  addView(options: RenderViewOptions): RenderView {
    this.ensureInitialized('addView');
    const view = new RenderView(this.renderer, options);
    this.views.push(view);
    this.installRaycastHandlers(view);
    view.updateViewport();
    this.invalidate();
    return view;
  }

  /** Removes and disposes a view added with addView. The main view stays. */
  removeView(view: RenderView): void {
    if (view === this.mainView) {
      console.error('[ThreeService] The main view cannot be removed.');
      return;
    }
    const index = this.views.indexOf(view);
    if (index === -1) return;
    this.views.splice(index, 1);
    this.removeRaycastHandlers(view);
    view.dispose();
    this.invalidate();
  }

  /**
   * Creates (or returns) the geometry slice: a second copy of the detector
   * geometry that projection views clip independently of the main view (see
   * ClippedGeometrySlice for the mechanism and the layer routing). The main
   * view keeps rendering the original geometry; pass the returned slice plus
   * a `clipPlane` in `addView` options to give an added view its own cut.
   *
   * Call `rebuildGeometrySlice()` after a geometry load while a slice exists.
   */
  createGeometrySlice(): ClippedGeometrySlice {
    this.ensureInitialized('createGeometrySlice');
    if (this.geometrySlice) return this.geometrySlice;
    const slice = new ClippedGeometrySlice();
    slice.rebuild(this.sceneGeometry);
    this.scene.add(slice.group);
    // Originals moved off layer 0 — the main view must opt into their layer.
    this.mainView.perspectiveCamera.layers.enable(GEOMETRY_MAIN_LAYER);
    this.mainView.orthographicCamera.layers.enable(GEOMETRY_MAIN_LAYER);
    this.geometrySlice = slice;
    // A previous slice's shader states (same plane-count shape) would be
    // bound to its orphaned plane array — force rebuilds against this one.
    this.dropClippingShaderState();
    this.invalidate();
    return slice;
  }

  /** Rebuilds the slice spine from the current geometry content (after loads). */
  rebuildGeometrySlice(): void {
    if (!this.geometrySlice) return;
    this.geometrySlice.rebuild(this.sceneGeometry);
    this.dropClippingShaderState();
    this.invalidate();
  }

  /** Removes the geometry slice and restores single-copy layer routing. */
  removeGeometrySlice(): void {
    if (!this.geometrySlice) return;
    this.scene.remove(this.geometrySlice.group);
    this.geometrySlice.dispose();
    this.geometrySlice = null;
    this.dropClippingShaderState();
    this.invalidate();
  }

  /**
   * When You Do Want to Recreate the Entire Scene
   * If sometimes you genuinely need to start fresh (e.g. user changed geometry drastically)
   */
  public reset(): void {
    this.stopRendering();
    // remove old scene from memory
    // e.g. dispose geometries, empty the scene, etc.
    this.renderer.domElement.parentNode?.removeChild(this.renderer.domElement);

    this.initialized = false;
    // next time `init` is called, it will do full creation again.
  }


  /**
   * Sets up the lighting for the scene.
   */
  private setupLights(): void {
    this.ambientLight = new AmbientLight(0xffffff, 0.4);
    this.ambientLight.name = "Light-Ambient";
    this.sceneHelpers.add(this.ambientLight);

    this.hemisphereLight = new HemisphereLight(0xffffff, 0x444444, 0.6);
    this.hemisphereLight.position.set(0, 200, 0);
    this.hemisphereLight.name = "Light-Hemisphere";
    this.sceneHelpers.add(this.hemisphereLight);

    this.directionalLight = new DirectionalLight(0xffffff, 0.8);
    this.directionalLight.position.set(100, 200, 100);
    this.directionalLight.name = "Light-Directional";
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 512;
    this.directionalLight.shadow.mapSize.height = 512;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 1000;
    this.sceneHelpers.add(this.directionalLight);

    this.pointLight = new PointLight(0xffffff, 0.5, 500);
    this.pointLight.position.set(-100, 100, -100);
    this.pointLight.castShadow = true;
    this.pointLight.name = "Light-Point";
    this.sceneHelpers.add(this.pointLight);

    this.spotLight = new SpotLight(0xffffff, 0.5);
    this.spotLight.position.set(0, 300, 0);
    this.spotLight.angle = Math.PI / 6;
    this.spotLight.penumbra = 0.2;
    this.spotLight.decay = 2;
    this.spotLight.distance = 1000;
    this.spotLight.castShadow = true;
    this.spotLight.name = "Light-Spot";
    this.sceneHelpers.add(this.spotLight);

    // Lights are collected per render pass by camera-layer test. A
    // tracks-on-top pass renders with ONLY the event layer enabled, and the
    // light set it collects must be IDENTICAL to every other pass — the set
    // is part of the render-object cache key, so a differing set would
    // rebuild every shared render object on every frame.
    for (const light of [this.ambientLight, this.hemisphereLight, this.directionalLight, this.pointLight, this.spotLight]) {
      light.layers.enable(EVENT_DATA_LAYER);
    }
  }

  /**
   * Adds default objects to the scene.
   */
  private addDefaultObjects(): void {
    // const gridHelper = new THREE.GridHelper(1000, 100);
    // gridHelper.name = "Grid";
    // this.sceneHelpers.add(gridHelper);

    this.axesHelper = new THREE.AxesHelper(1500);
    this.axesHelper.name = "Axes";
    this.sceneHelpers.add(this.axesHelper);

    // const geometry = new THREE.BoxGeometry(100, 100, 100);
    // const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    // const cube = new THREE.Mesh(geometry, material);
    // cube.name = "TestCube"
    // cube.castShadow = true;
    // cube.receiveShadow = true;
    // this.sceneGeometry.add(cube);
  }

  /**
   * Starts the rendering loop.
   */
  startRendering(): void {
    this.ensureInitialized('startRendering');

    if (this.animationFrameId !== null) {
      console.warn('[ThreeService]: Rendering loop is already running.');
      return;
    }

    this.shouldRender = true;
    this.ngZone.runOutsideAngular(() => {
      this.renderLoop();
    });
  }

  /**
   * Stops the rendering loop.
   */
  stopRendering(): void {
    this.shouldRender = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Schedules a render of every view on the next animation frame. THE
   * render-on-demand primitive: anything that changes renderable state calls
   * this (directly, or through the SceneContext/FrameContext contract).
   * Cheap and idempotent — flags are consumed once per frame.
   */
  invalidate(): void {
    this.renderRequested = true;
    for (const view of this.views) {
      view.dirty = true;
    }
  }

  /**
   * The render loop. Runs every animation frame; whether it RENDERS depends
   * on the scheduling mode: continuous renders always, on-demand only when a
   * dirty flag was set since the last frame (invalidate(), controls 'change',
   * per-view knobs). Flags are read-and-cleared here — never polled state.
   *
   * Animations sustain their own chains: a rendered frame runs the frame
   * callbacks and extension onFrame hooks, and an active animator (tween
   * group, gizmo transition, damping) re-invalidates until it settles.
   */
  private renderLoop(): void {
    if (!this.shouldRender) {
      return;
    }

    this.animationFrameId = requestAnimationFrame(() => this.renderLoop());

    try {
      const frameStartTime = performance.now();

      // Controls progression (damping, active interaction) — the one
      // permitted per-frame animator. It fires 'change' events that set the
      // per-view dirty flags, and goes quiet when motion settles.
      for (const view of this.views) {
        view.controls.update();
      }

      const anythingDirty = this.renderRequested || this.views.some(view => view.dirty);
      const rendering = this.continuousMode || anythingDirty;

      if (rendering) {
        // Profiling start
        this.profileBeginFunc?.();

        // Extension onFrame hooks run before rendering. Keep them cheap:
        // animation only, no state polling (state changes travel through
        // signals). deltaTime = ms since the previous RENDERED frame.
        if (this.frameContext && this.extensions.length > 0) {
          this.frameContext.deltaTime = this.lastFrameStartTime ? frameStartTime - this.lastFrameStartTime : 0;
          for (const extension of this.extensions) {
            extension.onFrame?.(this.frameContext);
          }
        }
        this.lastFrameStartTime = frameStartTime;

        this.renderRequested = false;

        if (this.views.length === 1) {
          // Single view: full-canvas render, no viewport/scissor state.
          // Goes through the view so per-view modes (tracks-on-top) apply
          // on the display page too; with them off this is exactly a plain
          // renderer.render.
          const view = this.mainView;
          view.dirty = false;
          view.renderFullFrame(this.renderer, this.scene);
          view.renderOverlays();
        } else {
          // Multiple views: each renders its own scissored rectangle of the
          // shared canvas. autoClear stays on — with the scissor test enabled
          // the clear applies per-rectangle, so views do not erase each other
          // WITHIN the frame. Every view must repaint EVERY frame: the
          // drawing buffer does not survive compositing
          // (preserveDrawingBuffer is false; WebGPU swap-chain textures
          // likewise start undefined), so a skipped view's rectangle would
          // show cleared background once the previous frame was presented.
          // Dirty flags decide whether a frame happens at all — never which
          // views paint within it.
          for (const view of this.views) {
            view.dirty = false;
          }
          this.renderer.setScissorTest(true);
          for (const view of this.views) {
            view.renderTo(this.renderer, this.scene);
          }
          this.renderer.setScissorTest(false);
          const canvas = this.renderer.domElement;
          this.renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight);
        }

        this.renderedFrameCount++;

        // Frame callbacks (tween advancement etc.) run on rendered frames;
        // an active animation re-invalidates, sustaining its own chain.
        for (const cb of this.frameCallbacks) {
          cb();
        }

        this.profileEndFunc?.();
      }

      // Stats update every RAF tick: FPS counts rendered frames only, so an
      // idle on-demand display correctly reads 0 (shown as "idle").
      this.perfService.updateStats(this.renderer, frameStartTime, rendering, this.continuousMode);
    } catch (error) {
      console.error('(!!!) ThreeService Render Loop Error:', error);
      this.stopRendering();
    }
  }

  /**
   * Adds a callback to be executed each frame before rendering.
   * Prevents duplicate callbacks.
   * @param callback Function to execute each frame.
   */
  addFrameCallback(callback: () => void): void {
    if (!this.frameCallbacks.includes(callback)) {
      this.frameCallbacks.push(callback);
    } else {
      console.warn('ThreeService: Attempted to add a duplicate frame callback.');
    }
  }

  /**
   * Removes a previously added frame callback.
   * @param callback The callback function to remove.
   */
  removeFrameCallback(callback: () => void): void {
    const index = this.frameCallbacks.indexOf(callback);
    if (index !== -1) {
      this.frameCallbacks.splice(index, 1);
    } else {
      console.warn('ThreeService: Attempted to remove a non-existent frame callback.');
    }
  }

  /**
   * Sets the size of the renderer and updates the camera projections.
   * @param width The new width in pixels.
   * @param height The new height in pixels.
   */
  setSize(width: number, height: number): void {
    if (!this.initialized) {
      console.error('ThreeService: setSize called before initialization.');
      return;
    }

    this.renderer.setSize(width, height);

    // Views recompute their viewport rectangles and camera aspects from
    // their containers (for the single main view: the whole canvas).
    for (const view of this.views) {
      view.updateViewport();
    }
    this.invalidate();
  }

  /**
   * Enables or disables local clipping.
   * @param enable Whether clipping should be enabled.
   */
  enableClipping(enable: boolean): void {
    this.angularClippingEnabled = enable;
    this.updateClippingGroups();
  }

  /**
   * Sets two-plane clipping by rotating the clipping planes.
   * @param startAngleDeg The starting angle in degrees.
   * @param openingAngleDeg The opening angle in degrees.
   */
  setClippingAngle(startAngleDeg: number, openingAngleDeg: number): void {
    const planeA = this.clipPlanes[0];
    const planeB = this.clipPlanes[1];

    this.clipIntersection = openingAngleDeg < 180;
    const startAngle = (startAngleDeg * Math.PI) / 180;
    const openingAngle = (openingAngleDeg * Math.PI) / 180;

    const quatA = new THREE.Quaternion();
    quatA.setFromAxisAngle(new THREE.Vector3(0, 0, 1), startAngle);
    planeA.normal.set(0, -1, 0).applyQuaternion(quatA);

    const quatB = new THREE.Quaternion();
    quatB.setFromAxisAngle(new THREE.Vector3(0, 0, 1), startAngle + openingAngle);
    planeB.normal.set(0, 1, 0).applyQuaternion(quatB);

    this.updateClippingGroups();
  }

  /**
   * Enables or disables Z-axis clipping.
   */
  enableZClipping(enable: boolean): void {
    this.zClippingEnabled = enable;
    this.updateClippingGroups();
  }

  /**
   * Updates the Z clipping plane from an absolute Z coordinate and direction.
   * @param zPosition The Z coordinate where the plane sits.
   * @param forward   If true, keeps z >= zPosition. If false, keeps z <= zPosition.
   *
   * THREE.Plane visible side: normal · point + constant >= 0
   *   Forward:  normal=(0,0,1),  constant=-pos  →  z - pos >= 0  →  z >= pos
   *   Backward: normal=(0,0,-1), constant=+pos  → -z + pos >= 0  →  z <= pos
   */
  updateZClipping(zPosition: number, forward: boolean): void {
    this.zClipPlane.normal.set(0, 0, forward ? 1 : -1);
    this.zClipPlane.constant = forward ? -zPosition : zPosition;
    this.invalidate();
  }

  /**
   * Synchronise the two nested ClippingGroups with the current clipping state.
   *
   * Scene structure:
   *   zClippingGroup (union mode, Z plane)
   *     └── sceneGeometry (intersection/union, angular wedge planes)
   *
   * Separating them into two groups lets each have its own clipIntersection mode.
   */
  private updateClippingGroups(): void {
    if (!this.initialized) return;

    // Angular (wedge) clipping on sceneGeometry
    this.sceneGeometry.clippingPlanes = this.angularClippingEnabled ? [...this.clipPlanes] : [];
    this.sceneGeometry.enabled = this.angularClippingEnabled;
    this.sceneGeometry.clipIntersection = this.angularClippingEnabled ? this.clipIntersection : false;

    // Z clipping on the parent wrapper
    this.zClippingGroup.clippingPlanes = this.zClippingEnabled ? [this.zClipPlane] : [];
    this.zClippingGroup.enabled = this.zClippingEnabled;

    // three.js (r183) does not reliably rebuild shaders when the SET of
    // clipping planes changes (plane positions are fine — they are uniforms):
    // RenderObjects.get short-circuits on material.version before consuming
    // the one-shot clippingNeedsUpdate getter, so a pipeline compiled without
    // planes keeps rendering unclipped after planes appear (and vice versa).
    // Dropping the cached render objects forces a rebuild against the current
    // clipping structure; built shader states stay cached by key, so toggling
    // back and forth does not recompile. Reusing those cached states across
    // toggles is only correct because the clipping-plane arrays keep their
    // identity — see patchThreeClippingContextArrayStability. Only runs when
    // the structure — enabled flags, plane count, intersection mode —
    // changes, never while a slider drags plane positions around.
    const structure = `${this.sceneGeometry.enabled}:${this.sceneGeometry.clipIntersection}:${this.sceneGeometry.clippingPlanes.length}:${this.zClippingEnabled}`;
    if (structure !== this.lastClippingStructure) {
      this.lastClippingStructure = structure;
      this.dropClippingShaderState();
    }
    this.invalidate();
  }

  /**
   * Drops the renderer's cached render objects AND built node states so the
   * next frame rebuilds them against the current clipping structure. Called
   * whenever the SET of active clipping planes changes (never for plane
   * position updates — those are uniforms).
   *
   * Both caches must go, for two different three.js (r183–r185) defects:
   *
   * - Render objects: RenderObjects.get short-circuits on material.version
   *   before consuming the one-shot clippingNeedsUpdate getter, so a pipeline
   *   compiled without planes keeps rendering unclipped after planes appear.
   *
   * - Node states: built shaders bind clipping planes to the ARRAY INSTANCE
   *   their ClippingContext held at build time, but ClippingContext.update()
   *   REPLACES its arrays whenever the parent group chain changes (e.g. an
   *   outer clipping group toggled). The state cache is keyed by plane
   *   COUNTS, so a toggle that returns to a previously-seen count would reuse
   *   a shader bound to the ORPHANED array — whose view-space plane values
   *   nobody re-projects, leaving the cut frozen to the camera (orbit moves
   *   the cut, zoom clips deeper). Evicting the states forces a rebuild that
   *   captures the live arrays. GPU programs are NOT recompiled on the way
   *   back: Pipelines caches programs by generated shader source, and equal
   *   clipping structure generates equal source — the rebuild cost is CPU
   *   node-graph work only, on a rare user action.
   *
   * three-clipping-internals.spec.ts pins the array-replacement behavior;
   * if a three upgrade makes it fail, re-evaluate whether this is still
   * needed.
   */
  private dropClippingShaderState(): void {
    const internals = this.renderer as unknown as {
      _objects?: { dispose(): void };
      _nodes?: { nodeBuilderCache?: Map<unknown, unknown> };
    };
    internals._objects?.dispose();
    internals._nodes?.nodeBuilderCache?.clear();
    if (!internals._objects || !internals._nodes?.nodeBuilderCache) {
      console.warn('[ThreeService] Renderer clipping caches not found — clipping toggles may show stale cuts (three internals moved?).');
    }
  }

  /**
   * Toggles the MAIN view between perspective and orthographic cameras.
   * @param useOrtho Whether to use the orthographic camera.
   */
  toggleOrthographicView(useOrtho: boolean): void {
    this.mainView.toggleOrthographicView(useOrtho);
    this.invalidate();
  }

  /**
   * Sets the main view's camera up vector, keeping its OrbitControls frame in
   * sync. Used by camera view presets and the viewport gizmo.
   */
  setCameraUp(up: THREE.Vector3): void {
    this.mainView.setCameraUp(up);
    this.invalidate();
  }



  /**
   * Ensures the service has been initialized before performing operations.
   * @param methodName The name of the method performing the check.
   */
  private ensureInitialized(methodName: string): void {
    if (!this.initialized) {
      const errorMsg = `ThreeService Error: Method '${methodName}' called before initialization. Call 'init(container)' first.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Cleans up resources when the service is destroyed.
   */
  ngOnDestroy(): void {
    for (const extension of this.extensions) {
      try {
        extension.onDispose?.();
      } catch (error) {
        console.error('[ThreeService] Extension onDispose failed:', extension, error);
      }
    }
    this.clearHighlight();
    this.stopRendering();
    this.cleanupEventListeners();
    for (const view of this.views) {
      view.dispose();
    }
    this.views = [];
    if(this.sceneGeometry) this.cleanupBVH(this.sceneGeometry);
    if(this.sceneEvent) this.cleanupBVH(this.sceneEvent);
  }


  logRendererInfo() {
    // Access the renderer from threeService
    const renderer = this.renderer;
    const info = renderer.info;
    console.log('Draw calls:', info.render.calls);
    console.log('Triangles:', info.render.triangles);
    console.log('Points:', info.render.points);
    console.log('Lines:', info.render.lines);
    console.log('Geometries in memory:', info.memory.geometries);
    console.log('Textures in memory:', info.memory.textures);
    console.log('Pipelines:', (info as any).pipelines?.length);
  }
  // /**
  //  * Initialize the hover point indicator
  //  */
  // private initHoverPoint(): void {
  //   const sphereGeom = new THREE.SphereGeometry(6, 16, 16);
  //   const sphereMat = new THREE.MeshBasicMaterial({
  //     color: 0xff0000,
  //     transparent: true,
  //     opacity: 0.8,
  //     depthTest: false,
  //     depthWrite: false
  //   });
  //
  //   this.hoverPoint = new THREE.Mesh(sphereGeom, sphereMat);
  //   this.hoverPoint.visible = false;
  //   this.hoverPoint.name = "HoverPoint";
  //   this.hoverPoint.renderOrder = 999;
  //   this.sceneHelpers.add(this.hoverPoint);
  // }

  /**
   * Highlight an object by making its material brighter
   */
  private highlightObject(object: THREE.Object3D): void {
    if (this.highlightedObject === object) return;

    // Clear previous highlight
    this.clearHighlight();

    if (object instanceof THREE.Mesh && object.material) {
      this.highlightedObject = object;

      // Store original material(s)
      this.originalMaterials.set(object, object.material);

      // Create highlighted version
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const highlightedMaterials = materials.map(mat => {
        const highlightMat = mat.clone();

        // Make material brighter by increasing emissive
        if ('emissive' in highlightMat) {
          highlightMat.emissive.setHex(0x444444); // Add subtle glow
        }

        // Increase overall brightness for materials that support it
        if ('color' in highlightMat && highlightMat.color) {
          highlightMat.color.multiplyScalar(1.5); // Make 50% brighter
        }

        highlightMat.needsUpdate = true;
        return highlightMat;
      });

      object.material = Array.isArray(object.material) ? highlightedMaterials : highlightedMaterials[0];
      this.invalidate();
    }
  }

  /**
   * Clear the current highlight
   */
  private clearHighlight(): void {
    if (this.highlightedObject && this.originalMaterials.has(this.highlightedObject)) {
      const original = this.originalMaterials.get(this.highlightedObject);
      if (this.highlightedObject instanceof THREE.Mesh && original) {
        this.highlightedObject.material = original;
      }
      this.originalMaterials.delete(this.highlightedObject);
      this.highlightedObject = null;
      this.invalidate();
    }
  }

  /**
   * Helper to check if a point is clipped by active clipping planes
   */
  private isPointClipped(point: THREE.Vector3): boolean {
    if (!this.angularClippingEnabled && !this.zClippingEnabled) {
      return false;
    }

    // Check Z clipping plane (global, always union mode)
    if (this.zClippingEnabled && this.zClipPlane.distanceToPoint(point) < 0) {
      return true;
    }

    // Check angular clipping planes
    if (this.angularClippingEnabled && this.clipPlanes.length > 0) {
      for (const plane of this.clipPlanes) {
        const distance = plane.distanceToPoint(point);
        if (distance < 0) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Filter intersections based on clipping planes
   */
  private filterClippedIntersections(intersections: THREE.Intersection[]): THREE.Intersection[] {
    if ((!this.angularClippingEnabled && !this.zClippingEnabled) || this.clipPlanes.length === 0) {
      return intersections;
    }

    return intersections.filter(intersection => !this.isPointClipped(intersection.point));
  }


  /**
   * Sets up the raycasting functionality with proper clipping support.
   * Handlers are installed per view: each view raycasts with its own camera
   * from pointer positions inside its own container.
   */
  private setupRaycasting(): void {
    for (const view of this.views) {
      this.installRaycastHandlers(view);
    }
  }

  private installRaycastHandlers(view: RenderView): void {
    if (this.viewPointerHandlers.has(view)) return;

    const buildBVHIfNeeded = (obj: any) => {
      // Ensure normals and bounding boxes are accurate for small details

      if (obj.isMesh && obj.geometry && !obj.geometry.boundsTree) {
        let mesh = obj as THREE.Mesh;
        if (!mesh.geometry.attributes['normal']) mesh.geometry.computeVertexNormals();

        // @ts-ignore
        obj.geometry.computeBoundsTree?.({maxLeafTris: 1});  // Better precision for small details


        if (this.showBVHDebug && mesh.geometry.boundsTree) {
          // Create the helper
          const helper = new MeshBVHHelper(mesh);

          // Optional: Style it so it isn't too overwhelming
          // (MeshBVHHelper creates a LineBasicMaterial)
          // if (helper['material'] && helper['material'] instanceof THREE.Material) {
          //    helper['material'].opacity = 0.5;
          //    helper['material'].transparent = true;
          //    // helper.depth = 10; // Uncomment to limit how deep down the tree to visualize
          //    // helper.color.setHex(0xff0000);
          // }
          console.log(helper);

          // Add to the mesh itself so it transforms (moves/rotates) with the object
          mesh.add(helper);
        }
      }
    };

    // Casts from the view camera through the pointer: event data first, then
    // geometry. The clipping filter applies to GEOMETRY hits only — event
    // data is never clipped visually (sceneEvent sits outside the clipping
    // groups), so it must stay pickable everywhere it is drawn.
    const pick = (event: { clientX: number; clientY: number }): THREE.Intersection | null => {
      const raycaster = view.raycasterFromEvent(event);
      if (!raycaster) return null;
      raycaster.firstHitOnly = false;

      const hitsEvt = raycaster.intersectObjects(this.sceneEvent.children, true);
      if (hitsEvt.length > 0) return hitsEvt[0];

      const hitsGeo = raycaster.intersectObjects(this.sceneGeometry.children, true);
      const filteredGeoHits = this.filterClippedIntersections(hitsGeo);
      return filteredGeoHits.length > 0 ? filteredGeoHits[0] : null;
    };

    //  Throttled hover handling to improve performance
    const onPointerMove = (event: PointerEvent) => {
      if (!this.isRaycastEnabled || this.measureMode) {
        this.clearHighlight();
        return;
      }

      //  Throttle hover events
      if (this.hoverTimeout) return;

      this.hoverTimeout = window.setTimeout(() => {
        this.hoverTimeout = null;

        this.sceneEvent.traverse(buildBVHIfNeeded);
        this.sceneGeometry.traverse(buildBVHIfNeeded);

        const intersection = pick(event);

        if (intersection && intersection.object.name &&
          !intersection.object.name.includes('Helper') &&
          !intersection.object.name.startsWith('MeasurePoint_') &&
          intersection.object.visible) {

          this.highlightObject(intersection.object);
          this.trackHovered.next({ track: intersection.object, point: intersection.point.clone() });
          console.log('[raycast] HOVER', intersection.object.name, intersection.point);

          this.ngZone.run(() => {
            this.pointHovered.next(intersection.point.clone());
          });
        } else {
          this.clearHighlight();
        }
      }, 16); // ~60fps throttling
    };

    //  Single click for selection only (no measurement, no preventDefault so
    //  OrbitControls keep working). Selection picking is always on — one
    //  raycast per click; only hover tracking is gated behind the raycast
    //  toggle (it costs a throttled raycast per pointer move).
    const onPointerDown = (event: PointerEvent) => {
      if (this.measureMode) return;

      // Only handle left mouse button
      if (event.button !== 0) return;

      const selected = pick(event);

      if (selected && selected.object.visible && selected.object.name &&
        selected.object.name !== 'HoverPoint' &&
        !selected.object.name.startsWith('MeasurePoint_')) {
        this.trackClicked.next({ track: selected.object, point: selected.point.clone(), intersection: selected });
        console.log('[raycast] SELECTED', selected.object.name, selected.point);
      }
    };

    //  Double-click handler for distance measurement
    const onDoubleClick = (event: MouseEvent) => {
      if (!this.isRaycastEnabled || !this.measureMode) return;

      event.preventDefault();
      event.stopPropagation();

      const picked = pick(event);

      if (picked && picked.object.visible &&
        picked.object.name !== 'HoverPoint' &&
        !picked.object.name.startsWith('MeasurePoint_')) {
        const pt = picked.point.clone();

        if (!this.firstMeasurePoint) {
          this.firstMeasurePoint = pt;
          this.showMeasurePoint(pt, 'first');
          console.log('[raycast] DIST: first point from', picked.object.name, pt);
        } else {
          const p1 = this.firstMeasurePoint.clone();
          const p2 = pt;
          const dist = p1.distanceTo(p2);

          this.showMeasurePoint(pt, 'second');

          this.ngZone.run(() => {
            this.distanceReady.next({ p1, p2, dist });
          });

          console.log('[raycast] DIST: second point from', picked.object.name, '→', dist.toFixed(2));

          //  Reset after measurement
          setTimeout(() => this.resetMeasurement(), 2000); // Clear after 2 seconds
        }
      }
    };

    // Listeners live on the view container: canvas events bubble to it in the
    // single-view page, and in multi-view pages the containers sit above the
    // canvas and receive the events directly.
    const handlers = { move: onPointerMove, down: onPointerDown, dblclick: onDoubleClick };
    this.viewPointerHandlers.set(view, handlers);
    view.container.addEventListener('pointermove', handlers.move, false);
    view.container.addEventListener('pointerdown', handlers.down, false);
    view.container.addEventListener('dblclick', handlers.dblclick, false);
  }

  /** Detaches the pointer handlers installed for a view. */
  private removeRaycastHandlers(view: RenderView): void {
    const handlers = this.viewPointerHandlers.get(view);
    if (!handlers) return;
    this.viewPointerHandlers.delete(view);
    view.container.removeEventListener('pointermove', handlers.move, false);
    view.container.removeEventListener('pointerdown', handlers.down, false);
    view.container.removeEventListener('dblclick', handlers.dblclick, false);
  }

//  Visual feedback for measurement points
  private showMeasurePoint(point: THREE.Vector3, type: 'first' | 'second'): void {
    const geometry = new THREE.SphereGeometry(8, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: type === 'first' ? 0x00ff00 : 0x0000ff, // Green for first, blue for second
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false
    });

    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(point);
    sphere.name = `MeasurePoint_${type}`;
    sphere.renderOrder = 1000;

    // Add to helpers scene
    this.sceneHelpers.add(sphere);
    this.measurementPoints.push(sphere);
    this.invalidate();
  }

//  Reset measurement state and clear visual indicators
  private resetMeasurement(): void {
    this.firstMeasurePoint = null;
    this.clearMeasurePoints();
  }

  private clearMeasurePoints(): void {
    this.measurementPoints.forEach(point => {
      this.sceneHelpers.remove(point);
      point.geometry.dispose();
      if (point.material instanceof THREE.Material) {
        point.material.dispose();
      }
    });
    this.measurementPoints = [];
    this.invalidate();
  }

  /**
   * Clean up event listeners
   */
  private cleanupEventListeners(): void {
    for (const view of [...this.viewPointerHandlers.keys()]) {
      this.removeRaycastHandlers(view);
    }

    //  Clear timeout if active
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
  }

  setupBVH(): void {
    const processMesh = (mesh: THREE.Mesh) => {
      if (mesh.geometry && !mesh.geometry.boundsTree) {
        // @ts-ignore
        mesh.geometry.computeBoundsTree({
          maxLeafTris: 10,
          strategy: 0
        });
      }
    };

    this.sceneGeometry.traverse((object) => {
      if ((object as any).isMesh) {
        processMesh(object as Mesh);
      }
    });

    this.sceneEvent.traverse((object) => {
      if ((object as any).isMesh) {
        processMesh(object as Mesh);
      }
    });
  }

  cleanupBVH(object: THREE.Object3D): void {

    if (object instanceof THREE.Mesh && object.geometry && object.geometry.boundsTree) {
      // @ts-ignore
      object.geometry.disposeBoundsTree();
    }
    if(object.children != null) {
      object.children.forEach(child => this.cleanupBVH(child));
    }
  }

  //  Enhanced toggle methods
  toggleRaycast(): void {
    this.isRaycastEnabled = !this.isRaycastEnabled;
    console.log(`Raycast is now ${this.isRaycastEnabled ? 'ENABLED' : 'DISABLED'}`);

    if (!this.isRaycastEnabled) {
      this.clearHighlight();
      //  Reset measurement when disabling raycast
      this.resetMeasurement();
    }
  }

  isRaycastEnabledState(): boolean {
    return this.isRaycastEnabled;
  }

}
