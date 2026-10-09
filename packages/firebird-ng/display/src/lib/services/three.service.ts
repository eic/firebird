import { Injectable, Injector, NgZone, OnDestroy, inject } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  HemisphereLight,
  DirectionalLight,
  AmbientLight,
  PointLight,
  SpotLight,
} from 'three';
import { WebGPURenderer, ClippingGroup } from 'three/webgpu';
import {PerfService} from "./perf.service";
import {BehaviorSubject, Subject, combineLatest} from "rxjs";
import { MeshBVHHelper } from 'three-mesh-bvh';

import {
  CAMERA_LIMITS,
  CLIPPING_ENABLED_CONFIG,
  CLIPPING_OPENING_ANGLE_CONFIG,
  CLIPPING_START_ANGLE_CONFIG,
  EVENT_DATA_LAYER,
  GEOMETRY_MAIN_LAYER,
  LAZY_THREE_EXTENSIONS,
  THREE_EXTENSIONS,
  Z_CLIPPING_ENABLED_CONFIG,
  Z_CLIPPING_FORWARD_CONFIG,
  Z_CLIPPING_POSITION_CONFIG,
  injectCameraPresets,
  type CameraLimits,
  type CameraPose,
  type CameraPreset,
  type FrameContext,
  type RenderView,
  type RenderViewOptions,
  type SceneContext,
  type ThreeExtension,
} from '@dexvis/firebird-ng/api';
import type {Event as FbEvent} from '@dexvis/firebird-core';
import {DEFAULT_CAMERA_LIMITS, RenderViewImpl} from './render-view';
import {ClippedGeometrySlice} from './geometry-slice';
import { ConfigService } from '@dexvis/app-features';
import { useFragmentShaderClipping } from './three-clipping-patch';
import { runIsolated, shouldRenderFrame } from './render-loop';
import {
  ClipPlaneSets,
  buildPickingBvh,
  clipPlaneSetsOf,
  collectBvhCandidates,
  intersectVisible,
  isClickGesture,
  isPointClipped,
  setWedgePlanes,
  useAcceleratedRaycast,
} from './picking';

/** A scene object under the pointer, with the raycast hit that found it. */
export interface PickedObject {
  track: THREE.Object3D;
  point: THREE.Vector3;
  intersection: THREE.Intersection;
}

/**
 * Runs `callback` when the browser is idle. Where requestIdleCallback is
 * missing, runs it soon with a deadline that expires one frame (16 ms) after
 * the callback starts.
 */
function whenIdle(callback: (deadline: { timeRemaining(): number }) => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(callback, { timeout: 1000 });
  } else {
    setTimeout(() => {
      const start = performance.now();
      callback({ timeRemaining: () => Math.max(0, 16 - (performance.now() - start)) });
    }, 1);
  }
}



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
  public views: RenderViewImpl[] = [];

  /** The primary view: the display page's camera and controls live here. */
  public get mainView(): RenderViewImpl {
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

  /** The first init()'s scene creation; later and concurrent calls await it. */
  private initPromise: Promise<void> | null = null;
  /**
   * Bumped by every init() and detach(). An init() whose number is no
   * longer current when its awaits resolve skips attaching the canvas and
   * starting the loop: a later init() or a detach() owns the display state.
   */
  private attachGeneration = 0;

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

  /** Callbacks run after every rendered frame (see addFrameCallback). */
  private frameCallbacks: Array<() => void> = [];

  /** Extensions whose onFrame threw: their onFrame is not called again. */
  private disabledFrameHooks = new WeakSet<ThreeExtension>();

  /** Scene background; ThemeService sets it, init() applies it. */
  private readonly background = new THREE.Color(0x3f3f3f);

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

  /** Camera presets (withCameraPreset): 'home' sets the start pose and the navigation cube's home. */
  private cameraPresets = injectCameraPresets();
  /** Orbit limits a pack pinned (withCameraLimits); null derives them from each loaded geometry. */
  private pinnedCameraLimits = inject(CAMERA_LIMITS, {optional: true});
  /** The limits in effect; views added later get them too. */
  private cameraLimits: CameraLimits = this.pinnedCameraLimits ?? DEFAULT_CAMERA_LIMITS;
  /** Bounding sphere of the geometry, computed on demand; undefined until then, null when empty. */
  private geometryBounds: THREE.Sphere | null | undefined = undefined;
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

  /** Adds a MeshBVHHelper to each mesh whose picking BVH gets built (debug GUI toggle). */
  public showBVHDebug: boolean = false;

  /** Geometry meshes waiting for their picking BVH (built in idle time after a load). */
  private bvhQueue: THREE.Mesh[] = [];
  private bvhBuildScheduled = false;

  /** Hover picking (opt-in through toggleRaycast). Click selection is always on. */
  private isRaycastEnabled = false;

  /** Pointer handlers installed per view, kept so views can be removed cleanly. */
  private viewPointerHandlers = new Map<RenderViewImpl, {
    move: (event: PointerEvent) => void;
    leave: (event: PointerEvent) => void;
    down: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
    cancel: (event: PointerEvent) => void;
    dblclick: (event: MouseEvent) => void;
  }>();

  /**
   * Hover highlight of detector geometry: the hovered mesh shows this one
   * shared material while its own is parked in hoveredMeshMaterial. Event
   * data is never highlighted here — its hover goes out through
   * `trackHovered`, and SelectionService routes it to the owning painter.
   */
  private readonly hoverMaterial = new THREE.MeshLambertMaterial({
    color: 0xffe082,
    emissive: 0x403010,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  private hoveredMesh: THREE.Mesh | null = null;
  private hoveredMeshMaterial: THREE.Material | THREE.Material[] | null = null;
  /** True while the last hover pick hit event data (a null still has to go out when it ends). */
  private hoveringEventData = false;

  /**
   * Event data under the pointer (hover picking only), or null when the
   * pointer left it. SelectionService turns this into the painter's entity
   * highlight.
   */
  public trackHovered = new Subject<PickedObject | null>();
  /** A click (press and release without dragging) picked this object. */
  public trackClicked = new Subject<PickedObject>();

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


  constructor(
    private ngZone: NgZone,
    private perfService: PerfService) {
    // Initialization happens in init()
  }

  /**
   * Attaches the display to a container: the first call creates the scene,
   * renderer, main view and lights; later calls move the existing canvas and
   * main view into the new container (page revisits). Either way the render
   * loop runs afterwards. Concurrent calls are safe: they share the one
   * scene creation, and only the most recent call attaches.
   *
   * @param container The ID of the HTML element, or the element itself.
   * @returns True when this call attached the display; false when a later
   *          init() or a detach() superseded it while it waited.
   */
  async init(container: string | HTMLElement): Promise<boolean> {

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

    const generation = ++this.attachGeneration;
    const creates = this.initPromise === null;
    if (creates) {
      this.initPromise = this.createScene(containerElement);
    }
    try {
      await this.initPromise;
    } catch (error) {
      // A failed creation must not poison later attempts.
      if (creates) this.initPromise = null;
      throw error;
    }

    if (generation !== this.attachGeneration) {
      return false;
    }
    // The creating call already placed the canvas and main view.
    if (!creates) {
      this.attachRenderer(containerElement);
    }
    this.startRendering();
    return true;
  }

  /**
   * Detaches the display: the page that hosted the canvas went away, so the
   * render loop stops (nothing would show its frames). The scene, views and
   * extensions stay; the next init() re-attaches the canvas and restarts
   * the loop. Display pages call this from ngOnDestroy.
   */
  detach(): void {
    this.attachGeneration++;
    this.stopRendering();
    this.endHover();
  }

  /**
   * Sets the scene background color (the theme's canvas color). Applies at
   * once when the scene exists, otherwise when init() creates it.
   */
  setBackground(color: THREE.ColorRepresentation): void {
    this.background.set(color);
    if (this.scene) {
      this.scene.background = this.background;
      this.invalidate();
    }
  }

  /** The one-time creation behind init(): scene, renderer, main view, lights, extensions. */
  private async createScene(containerElement: HTMLElement): Promise<void> {
    this.containerElement = containerElement;

    // 1) Create scene
    this.scene = new THREE.Scene();
    this.scene.background = this.background;

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
    useFragmentShaderClipping();
    this.renderer = new WebGPURenderer({ antialias: true , logarithmicDepthBuffer: true, stencil:true});
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    // WebGPURenderer dropped PCFSoftShadowMap in three r186 and falls back to
    // PCFShadowMap with a warning on the first render; request it directly.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    await this.renderer.init();

    // Append renderer to the container
    this.containerElement.appendChild(this.renderer.domElement);

    // The main view owns the cameras, OrbitControls, and viewport handling.
    // It starts at a pinned home view, or at the HENP top view (see
    // RenderViewImpl); a startup command (?cmd=camera-preset:...) moves it after init.
    const mainView = new RenderViewImpl(this.renderer, {
      name: 'main',
      container: this.containerElement,
      startPose: this.pinnedHomePose(),
      distanceLimits: this.cameraLimits,
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

    // Geometry clipping of the main chain follows its config keys, whatever
    // sets them: the toolbar's clipping panel, a deep link
    // (?config.clippingEnabled=...), the server config or a saved value.
    // Bound here, not in the toolbar, so pages without the toolbar clip too.
    if (this.configService) {
      this.bindClippingConfig(this.configService);
    }
    this.updateClippingGroups();

    // ----------- POST INIT ------------------

    // Set initial size
    const width = this.containerElement.clientWidth;
    const height = this.containerElement.clientHeight;
    this.setSize(width, height);

    // Pointer picking per view (hover, click selection, measurement)
    this.setupRaycasting();

    // Extension lifecycle: onSceneInit fires strictly AFTER the async renderer
    // init resolved — extensions never see a half-initialized scene. Lazy
    // extensions load after that, off the critical path. init() starts the
    // render loop once this creation resolved.
    this.initExtensions();
    void this.activateLazyExtensions();
  }

  /**
   * Applies the clipping config keys to the wedge and Z clipping groups now
   * and on every change. The subscriptions live as long as this root service.
   */
  private bindClippingConfig(config: ConfigService): void {
    const wedge = [
      config.declare(CLIPPING_ENABLED_CONFIG),
      config.declare(CLIPPING_START_ANGLE_CONFIG),
      config.declare(CLIPPING_OPENING_ANGLE_CONFIG),
    ] as const;
    combineLatest([wedge[0].changes$, wedge[1].changes$, wedge[2].changes$])
      .subscribe(([enabled, startAngle, openingAngle]) => {
        this.setClippingAngle(startAngle, openingAngle);
        this.enableClipping(enabled);
      });

    const z = [
      config.declare(Z_CLIPPING_ENABLED_CONFIG),
      config.declare(Z_CLIPPING_POSITION_CONFIG),
      config.declare(Z_CLIPPING_FORWARD_CONFIG),
    ] as const;
    combineLatest([z[0].changes$, z[1].changes$, z[2].changes$])
      .subscribe(([enabled, position, forward]) => {
        this.updateZClipping(position, forward);
        this.enableZClipping(enabled);
      });
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
      addEventObject: (object: THREE.Object3D) => this.addEventObject(object),
      invalidate,
    };
    this.frameContext = {
      deltaTime: 0,
      renderer: this.renderer,
      get camera() { return service.camera; },
      invalidate,
    };
    const context = this.sceneContext;
    runIsolated(this.extensions, extension => extension.onSceneInit?.(context),
      (extension, error) => console.error('[ThreeService] Extension onSceneInit failed:', extension, error));
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
    runIsolated(this.extensions, extension => extension.onEventLoaded?.(event),
      (extension, error) => console.error('[ThreeService] Extension onEventLoaded failed:', extension, error));
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
  addView(options: RenderViewOptions): RenderViewImpl {
    this.ensureInitialized('addView');
    const view = new RenderViewImpl(this.renderer, { distanceLimits: this.cameraLimits, ...options });
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
    const index = this.views.findIndex(candidate => candidate === view);
    if (index === -1) return;
    const [removed] = this.views.splice(index, 1);
    this.removeRaycastHandlers(removed);
    removed.dispose();
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
    // Copies do not inherit the per-mesh accelerated raycast of the originals.
    useAcceleratedRaycast(slice.group);
    // A previous slice's shader states (same plane-count shape) would be
    // bound to its orphaned plane array — force rebuilds against this one.
    this.dropClippingShaderState();
    this.invalidate();
    return slice;
  }

  /**
   * Rebuilds the slice spine from the current geometry content (after
   * loads). Always schedules a render, slice or not: callers use it as the
   * "geometry content changed" notification.
   */
  rebuildGeometrySlice(): void {
    if (this.geometrySlice) {
      this.geometrySlice.rebuild(this.sceneGeometry);
      useAcceleratedRaycast(this.geometrySlice.group);
      this.dropClippingShaderState();
    }
    this.invalidate();
  }

  /**
   * Call after the content under `sceneGeometry` changed (a geometry load
   * added or replaced it). Rebuilds the projection views' geometry copy when
   * one exists, queues the picking BVH builds, and schedules a render — the
   * on-demand loop draws nothing new without that.
   */
  geometryChanged(): void {
    this.clearHoverHighlight();
    useAcceleratedRaycast(this.sceneGeometry);
    this.rebuildGeometrySlice();
    this.scheduleGeometryBvh();
    this.geometryBounds = undefined;
    this.frameGeometry();
  }

  // -------------------------------------------------------------------------
  // Camera framing and presets
  // -------------------------------------------------------------------------

  /**
   * The bounding sphere of everything under `sceneGeometry`, in world
   * coordinates (mm); null when there is no geometry. Computed on first use
   * after each geometry change.
   */
  geometryBoundingSphere(): THREE.Sphere | null {
    if (this.geometryBounds === undefined) {
      const box = new THREE.Box3().setFromObject(this.sceneGeometry);
      this.geometryBounds = box.isEmpty() ? null : box.getBoundingSphere(new THREE.Sphere());
    }
    return this.geometryBounds;
  }

  /** The 'home' preset as a start pose, when a pack pinned it to a fixed pose. */
  private pinnedHomePose(): CameraPose | undefined {
    const home = this.cameraPresets.find(preset => preset.name === 'home');
    if (!home || !('position' in home)) return undefined;
    return { position: home.position, target: home.target, up: home.up ?? [1, 0, 0] };
  }

  /**
   * Camera framing after a geometry load, for what no pack pinned: orbit
   * limits from the geometry's bounding sphere (radius r: 0.05 r to 5 r),
   * and the 'home' view when it frames the geometry and the camera has not
   * moved since startup. The bounding sphere is computed only when needed.
   */
  private frameGeometry(): void {
    if (!this.pinnedCameraLimits) {
      const bounds = this.geometryBoundingSphere();
      if (bounds && bounds.radius > 0) {
        this.cameraLimits = { minDistance: bounds.radius * 0.05, maxDistance: bounds.radius * 5 };
        for (const view of this.views) {
          view.setDistanceLimits(this.cameraLimits);
        }
      }
    }
    const home = this.cameraPresets.find(preset => preset.name === 'home');
    if (home && 'fitGeometry' in home && home.fitGeometry && this.mainView?.isAtStartPose()) {
      this.applyCameraPreset(home);
    }
    this.invalidate();
  }

  /**
   * Moves the main camera to a preset (see `CameraPreset`). A view-direction
   * preset keeps the orbit target and distance, or with `fitGeometry` frames
   * the loaded geometry's bounding sphere; before any geometry it keeps them
   * too.
   */
  applyCameraPreset(preset: CameraPreset): void {
    const camera = this.camera;
    const controls = this.controls;
    if ('position' in preset) {
      camera.position.set(...preset.position);
      controls.target.set(...preset.target);
    } else {
      const bounds = preset.fitGeometry ? this.geometryBoundingSphere() : null;
      if (bounds) {
        controls.target.copy(bounds.center);
      }
      // The sphere fits the vertical field of view at radius / sin(fov / 2)
      const fitDistance = bounds && 'fov' in camera
        ? bounds.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)
        : 0;
      const distance = fitDistance || camera.position.distanceTo(controls.target) || 7000;
      camera.position
        .copy(controls.target)
        .addScaledVector(new THREE.Vector3(...preset.direction), distance);
    }
    if (preset.up) {
      this.setCameraUp(new THREE.Vector3(...preset.up));
    }
    controls.update();
  }

  /**
   * Adds an object to the event data: under sceneEvent, on EVENT_DATA_LAYER
   * with its whole subtree (never clipped, drawn in every view, in the second
   * pass of tracks-on-top views), and schedules a frame.
   */
  addEventObject(object: THREE.Object3D): void {
    this.sceneEvent.add(object);
    object.traverse(node => node.layers.set(EVENT_DATA_LAYER));
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
   * Starts the rendering loop. Does nothing when it already runs. init()
   * starts it; call this only to resume after an explicit stopRendering().
   */
  startRendering(): void {
    this.ensureInitialized('startRendering');

    if (this.animationFrameId !== null) {
      return;
    }

    this.shouldRender = true;
    this.renderRequested = true;
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

      const rendering = shouldRenderFrame(this.continuousMode, this.renderRequested, this.views);

      if (rendering) {
        // Profiling start
        this.profileBeginFunc?.();

        // Extension onFrame hooks run before rendering. Keep them cheap:
        // animation only, no state polling (state changes travel through
        // signals). deltaTime = ms since the previous RENDERED frame. A hook
        // that throws is logged and not called again; the loop goes on.
        const frameContext = this.frameContext;
        if (frameContext && this.extensions.length > 0) {
          frameContext.deltaTime = this.lastFrameStartTime ? frameStartTime - this.lastFrameStartTime : 0;
          const failed = runIsolated(this.extensions,
            extension => {
              if (extension.onFrame && !this.disabledFrameHooks.has(extension)) {
                extension.onFrame(frameContext);
              }
            },
            (extension, error) => console.error('[ThreeService] Extension onFrame failed; disabling its onFrame:', extension, error));
          for (const extension of failed) {
            this.disabledFrameHooks.add(extension);
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
        // an active animation re-invalidates, sustaining its own chain. A
        // callback that throws is logged and removed; the loop goes on.
        const failedCallbacks = runIsolated(this.frameCallbacks, callback => callback(),
          (callback, error) => console.error('[ThreeService] Frame callback failed; removing it:', callback, error));
        for (const callback of failedCallbacks) {
          this.removeFrameCallback(callback);
        }

        this.profileEndFunc?.();
      }

      // Stats update every RAF tick: FPS counts rendered frames only, so an
      // idle on-demand display correctly reads 0 (shown as "idle").
      this.perfService.updateStats(this.renderer, frameStartTime, rendering, this.continuousMode);
    } catch (error) {
      // Hooks and callbacks are isolated above; what lands here is a
      // renderer failure, which would repeat on every frame.
      console.error('(!!!) ThreeService Render Loop Error:', error);
      this.stopRendering();
    }
  }

  /**
   * Adds a callback that runs after every RENDERED frame (under on-demand
   * scheduling, idle frames skip it; an animation re-invalidates from its
   * callback to keep frames coming). Prevents duplicate callbacks. A
   * callback that throws is logged and removed.
   * @param callback Function to execute each rendered frame.
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
    this.clipIntersection = setWedgePlanes(this.clipPlanes[0], this.clipPlanes[1], startAngleDeg, openingAngleDeg);
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

    // three.js does not reliably rebuild shaders when the SET of clipping
    // planes changes (plane positions are fine — they are uniforms); see
    // dropClippingShaderState for the two defects. The eviction runs only
    // when the structure — enabled flags, plane count, intersection mode —
    // changes, never while a slider drags plane positions around.
    const structure = `${this.sceneGeometry.enabled}:${this.sceneGeometry.clipIntersection}:${this.sceneGeometry.clippingPlanes.length}:${this.zClippingEnabled}`;
    if (structure !== this.lastClippingStructure) {
      this.lastClippingStructure = structure;
      this.dropClippingShaderState();
    }
    this.invalidate();
  }

  /**
   * Makes the next frame rebuild every clipped object's render state against
   * the current clipping structure. Called whenever the SET of active
   * clipping planes changes (never for plane position updates — those are
   * uniforms).
   *
   * Two three.js defects make the rebuild necessary:
   *
   * - Render objects: RenderObjects.get short-circuits on material.version
   *   before consuming the one-shot clippingNeedsUpdate getter, so a pipeline
   *   compiled without planes keeps rendering unclipped after planes appear.
   *
   * - Node states: built shaders bind clipping planes to the ARRAY INSTANCE
   *   their ClippingContext held at build time, but ClippingContext.update()
   *   REPLACES its arrays whenever the parent group chain changes (e.g. an
   *   outer clipping group toggled). A toggle that returns to a
   *   previously-seen plane-count shape would reuse a shader bound to the
   *   ORPHANED array — whose view-space plane values nobody re-projects,
   *   leaving the cut frozen to the camera (orbit moves the cut, zoom clips
   *   deeper).
   *
   * The eviction disposes the materials of the clipped subtrees (the
   * original geometry and the slice copy share them). Every render object
   * built for a material listens to its 'dispose' event and releases itself
   * through the renderer's reference counting: pipeline, bindings and node
   * state usage drop, and a node state whose last user went away leaves the
   * cache. Disposing a material keeps it usable; the next frame builds fresh
   * render objects and node states that capture the live plane arrays.
   * Objects outside the clipping chain (event data, helpers) keep theirs.
   *
   * three-clipping-internals.spec.ts pins the array-replacement behavior.
   * Without this eviction the cut stays frozen to the camera after a toggle;
   * with it, repeated toggles keep the render-object count flat.
   */
  private dropClippingShaderState(): void {
    // A hovered mesh shows the shared hover material; restore its own first
    // so the eviction reaches the material it renders with afterwards.
    this.clearHoverHighlight();
    const materials = new Set<THREE.Material>();
    const collect = (object: THREE.Object3D) => {
      const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) {
        for (const entry of material) materials.add(entry);
      } else if (material) {
        materials.add(material);
      }
    };
    this.zClippingGroup?.traverse(collect);
    this.geometrySlice?.group.traverse(collect);
    for (const material of materials) {
      material.dispose();
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
   * Application teardown (the root injector is destroyed): extensions get
   * onDispose, then views, listeners, BVHs and the renderer go away. Display
   * pages unmounting do not reach this; they call detach().
   */
  ngOnDestroy(): void {
    runIsolated(this.extensions, extension => extension.onDispose?.(),
      (extension, error) => console.error('[ThreeService] Extension onDispose failed:', extension, error));
    this.clearHoverHighlight();
    this.stopRendering();
    this.cleanupEventListeners();
    for (const view of this.views) {
      view.dispose();
    }
    this.views = [];
    this.bvhQueue = [];
    if(this.sceneGeometry) this.cleanupBVH(this.sceneGeometry);
    if(this.sceneEvent) this.cleanupBVH(this.sceneEvent);
    this.hoverMaterial.dispose();
    this.renderer?.dispose();
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

  // -------------------------------------------------------------------------
  // Hover highlight
  // -------------------------------------------------------------------------

  /**
   * Shows the shared hover material on a geometry mesh. The mesh's own
   * material is parked and comes back in clearHoverHighlight; nothing is
   * cloned, so knob restyles and selection highlights keep acting on the
   * real material.
   */
  private highlightGeometryMesh(mesh: THREE.Mesh): void {
    if (this.hoveredMesh === mesh) return;
    this.clearHoverHighlight();
    this.hoveredMesh = mesh;
    this.hoveredMeshMaterial = mesh.material;
    mesh.material = this.hoverMaterial;
    this.invalidate();
  }

  /**
   * Restores the hovered geometry mesh's own material. Call before
   * disposing or replacing geometry that may be under the pointer.
   */
  clearHoverHighlight(): void {
    const mesh = this.hoveredMesh;
    if (!mesh) return;
    if (this.hoveredMeshMaterial) {
      mesh.material = this.hoveredMeshMaterial;
    }
    this.hoveredMesh = null;
    this.hoveredMeshMaterial = null;
    this.invalidate();
  }

  /** Ends any hover: geometry highlight off, and event-data hover reported as left. */
  private endHover(): void {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.clearHoverHighlight();
    if (this.hoveringEventData) {
      this.hoveringEventData = false;
      this.trackHovered.next(null);
    }
  }

  // -------------------------------------------------------------------------
  // Picking
  // -------------------------------------------------------------------------

  /**
   * The clipping planes that hide geometry in `view`. A view with its own
   * cut renders the slice copy, clipped by its plane alone; every other view
   * renders the original geometry under the main chain (Z group around the
   * wedge group).
   */
  private clipPlanesFor(view: RenderViewImpl): ClipPlaneSets {
    if (view.geometrySlice && view.clipPlane) {
      return clipPlaneSetsOf([{
        enabled: view.geometrySlice.group.enabled,
        clipIntersection: view.geometrySlice.group.clipIntersection,
        clippingPlanes: [view.clipPlane],
      }]);
    }
    return clipPlaneSetsOf([this.zClippingGroup, this.sceneGeometry]);
  }

  /** The geometry subtree `view` renders: the slice copy for views with their own cut. */
  private geometryRootFor(view: RenderViewImpl): THREE.Object3D {
    return view.geometrySlice && view.clipPlane ? view.geometrySlice.group : this.sceneGeometry;
  }

  /**
   * Casts from the view camera through the pointer: event data first, then
   * geometry. Invisible subtrees (hidden pieces, hidden detector parts) are
   * skipped. The clip test applies to GEOMETRY hits only — event data is
   * never clipped visually (sceneEvent sits outside the clipping groups),
   * so it stays pickable everywhere it is drawn.
   */
  private pick(view: RenderViewImpl, event: { clientX: number; clientY: number }): { hit: THREE.Intersection; isEventData: boolean } | null {
    const raycaster = view.raycasterFromEvent(event);
    if (!raycaster) return null;
    raycaster.firstHitOnly = false;

    const isPickable = (hit: THREE.Intersection) => {
      const name = hit.object.name;
      return !name.includes('Helper') && !name.startsWith('MeasurePoint_');
    };

    const eventHit = intersectVisible(raycaster, [this.sceneEvent]).find(isPickable);
    if (eventHit) return { hit: eventHit, isEventData: true };

    const planes = this.clipPlanesFor(view);
    const geometryHit = intersectVisible(raycaster, [this.geometryRootFor(view)])
      .find(hit => isPickable(hit) && !isPointClipped(hit.point, planes));
    return geometryHit ? { hit: geometryHit, isEventData: false } : null;
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

  private installRaycastHandlers(view: RenderViewImpl): void {
    if (this.viewPointerHandlers.has(view)) return;

    // Hover: throttled, opt-in (toggleRaycast). The latest pointer position
    // wins when the throttle window closes.
    let lastMove: PointerEvent | null = null;
    const onPointerMove = (event: PointerEvent) => {
      if (!this.isRaycastEnabled || this.measureMode) {
        this.endHover();
        return;
      }
      // A pressed button means an orbit or pan is in progress.
      if (event.buttons !== 0) return;

      lastMove = event;
      if (this.hoverTimeout) return;

      this.hoverTimeout = window.setTimeout(() => {
        this.hoverTimeout = null;
        if (!lastMove) return;
        const picked = this.pick(view, lastMove);

        if (picked?.isEventData) {
          this.clearHoverHighlight();
          this.hoveringEventData = true;
          const { hit } = picked;
          this.trackHovered.next({ track: hit.object, point: hit.point.clone(), intersection: hit });
        } else {
          if (this.hoveringEventData) {
            this.hoveringEventData = false;
            this.trackHovered.next(null);
          }
          const mesh = picked?.hit.object as THREE.Mesh | undefined;
          if (mesh?.isMesh) {
            this.highlightGeometryMesh(mesh);
          } else {
            this.clearHoverHighlight();
          }
        }

        if (picked) {
          const point = picked.hit.point.clone();
          this.ngZone.run(() => this.pointHovered.next(point));
        }
      }, 16); // ~60fps throttling
    };

    const onPointerLeave = () => {
      lastMove = null;
      this.endHover();
    };

    // Selection: a click (press and release without dragging) picks.
    // Selecting on the press would select whatever lies under the pointer
    // when an orbit starts. No preventDefault: OrbitControls keep working.
    let press: { pointerId: number; clientX: number; clientY: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      press = event.button === 0 && !this.measureMode
        ? { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY }
        : null;
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = press;
      press = null;
      if (!start || event.pointerId !== start.pointerId || event.button !== 0 || this.measureMode) return;
      if (!isClickGesture(start, event)) return;

      const picked = this.pick(view, event);
      if (picked) {
        const { hit } = picked;
        this.trackClicked.next({ track: hit.object, point: hit.point.clone(), intersection: hit });
      }
    };
    const onPointerCancel = () => {
      press = null;
    };

    //  Double-click handler for distance measurement
    const onDoubleClick = (event: MouseEvent) => {
      if (!this.isRaycastEnabled || !this.measureMode) return;

      event.preventDefault();
      event.stopPropagation();

      const picked = this.pick(view, event)?.hit;

      if (picked) {
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
    const handlers = {
      move: onPointerMove,
      leave: onPointerLeave,
      down: onPointerDown,
      up: onPointerUp,
      cancel: onPointerCancel,
      dblclick: onDoubleClick,
    };
    this.viewPointerHandlers.set(view, handlers);
    view.container.addEventListener('pointermove', handlers.move, false);
    view.container.addEventListener('pointerleave', handlers.leave, false);
    view.container.addEventListener('pointerdown', handlers.down, false);
    view.container.addEventListener('pointerup', handlers.up, false);
    view.container.addEventListener('pointercancel', handlers.cancel, false);
    view.container.addEventListener('dblclick', handlers.dblclick, false);
  }

  /** Detaches the pointer handlers installed for a view. */
  private removeRaycastHandlers(view: RenderViewImpl): void {
    const handlers = this.viewPointerHandlers.get(view);
    if (!handlers) return;
    this.viewPointerHandlers.delete(view);
    view.container.removeEventListener('pointermove', handlers.move, false);
    view.container.removeEventListener('pointerleave', handlers.leave, false);
    view.container.removeEventListener('pointerdown', handlers.down, false);
    view.container.removeEventListener('pointerup', handlers.up, false);
    view.container.removeEventListener('pointercancel', handlers.cancel, false);
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

  // -------------------------------------------------------------------------
  // Picking BVHs
  // -------------------------------------------------------------------------

  /**
   * Queues a picking BVH for every geometry mesh and builds them in idle
   * time, a few meshes per idle period, so a load never blocks the page for
   * the whole detector at once. Until a mesh's BVH exists, picking falls
   * back to three's raycast for it. A new load replaces the queue.
   */
  private scheduleGeometryBvh(): void {
    this.bvhQueue = collectBvhCandidates(this.sceneGeometry);
    if (this.bvhBuildScheduled || this.bvhQueue.length === 0) return;
    this.bvhBuildScheduled = true;
    whenIdle(deadline => this.buildQueuedBvh(deadline));
  }

  private buildQueuedBvh(deadline: { timeRemaining(): number }): void {
    const start = performance.now();
    let built = 0;
    // At least one mesh per idle period, then as many as the period allows.
    do {
      const mesh = this.bvhQueue.shift();
      if (!mesh) break;
      // A newer load may have removed it while it waited.
      if (!this.isUnderGeometry(mesh)) continue;
      if (buildPickingBvh(mesh)) built++;
      if (this.showBVHDebug && mesh.geometry.boundsTree) {
        mesh.add(new MeshBVHHelper(mesh));
        this.invalidate();
      }
    } while (this.bvhQueue.length > 0 && deadline.timeRemaining() > 2);

    const elapsed = performance.now() - start;
    if (elapsed > 50) {
      console.log(`[ThreeService] Picking BVH: ${built} built in ${elapsed.toFixed(0)} ms, ${this.bvhQueue.length} queued`);
    }
    if (this.bvhQueue.length > 0) {
      whenIdle(next => this.buildQueuedBvh(next));
    } else {
      this.bvhBuildScheduled = false;
    }
  }

  private isUnderGeometry(object: THREE.Object3D): boolean {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      if (node === this.sceneGeometry) return true;
    }
    return false;
  }

  /** Drops the picking BVHs of a subtree (they are rebuilt by the next geometryChanged()). */
  cleanupBVH(object: THREE.Object3D): void {
    object.traverse(child => {
      const geometry = (child as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (geometry?.boundsTree) {
        geometry.boundsTree = undefined;
      }
    });
  }

  //  Enhanced toggle methods
  toggleRaycast(): void {
    this.isRaycastEnabled = !this.isRaycastEnabled;
    console.log(`Raycast is now ${this.isRaycastEnabled ? 'ENABLED' : 'DISABLED'}`);

    if (!this.isRaycastEnabled) {
      this.endHover();
      //  Reset measurement when disabling raycast
      this.resetMeasurement();
    }
  }

  isRaycastEnabledState(): boolean {
    return this.isRaycastEnabled;
  }

}
