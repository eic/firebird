import { Injectable, NgZone, OnDestroy} from '@angular/core';
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
import {PerfService} from "./perf.service";
import {BehaviorSubject, Subject} from "rxjs";


import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree, MeshBVH, MeshBVHHelper
} from 'three-mesh-bvh';



@Injectable({
  providedIn: 'root',
})
export class ThreeService implements OnDestroy {


  /** Three.js core components */
  public scene!: THREE.Scene;
  public sceneGeometry!: THREE.Group;
  public sceneEvent!: THREE.Group;
  public sceneHelpers!: THREE.Group;
  public renderer!: THREE.WebGLRenderer;
  public controls!: OrbitControls;

  /** Camera that is actually used */
  public camera!: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  public cameraMode$ = new BehaviorSubject<boolean>(true);

  /** Optional clipping planes and logic. */
  public clipPlanes = [
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  ];

  /** Functions callbacks that help organize performance */
  public profileBeginFunc: (() => void) | null = null;
  public profileEndFunc: (() => void) | null = null;

  /** Cameras */
  private perspectiveCamera!: THREE.PerspectiveCamera;
  private orthographicCamera!: THREE.OrthographicCamera;


  /** Animation loop control */
  private animationFrameId: number | null = null;
  private shouldRender = false;

  /** Callbacks to run each frame before rendering. */
  private frameCallbacks: Array<() => void> = [];


  private clipIntersection: boolean = false;

  /** Initialization flag */
  private initialized: boolean = false;

  /** Reference to the container element used for rendering */
  private containerElement!: HTMLElement;

  /** Lights */
  private ambientLight!: AmbientLight;
  private hemisphereLight!: HemisphereLight;
  private directionalLight!: DirectionalLight;
  private pointLight!: PointLight; // Optional
  private spotLight!: SpotLight; // Optional

  /** BVH wizard */
  private boundsViz!: MeshBVHHelper;

   // Raycasting properties
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private isRaycastEnabled = false;


  // Track hover indicator
  // private hoverPoint: THREE.Mesh | null = null;

  // Track highlighted object for raycast feedback
  private highlightedObject: THREE.Object3D | null = null;
  private originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();

  // Events
  public trackHovered = new Subject<{track: THREE.Object3D, point: THREE.Vector3}>();
  public trackClicked = new Subject<{track: THREE.Object3D, point: THREE.Vector3}>();

  // Raw hit point every frame (hover)
  public pointHovered = new Subject<THREE.Vector3>();

  // Distance ready after second point
  public distanceReady = new Subject<{ p1: THREE.Vector3; p2: THREE.Vector3; dist: number }>();

  // Toggle by UI when “3‑D Distance” checkbox is on
  public measureMode = false;

  // temp storage for first measure point
  private firstMeasurePoint: THREE.Vector3 | null = null;

  //  Add properties for event handlers and measurement state
  private pointerMoveHandler?: (event: PointerEvent) => void;
  private pointerDownHandler?: (event: PointerEvent) => void;
  private doubleClickHandler?: (event: MouseEvent) => void;
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
  init(container: string | HTMLElement): void {

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

    // Geometry scene tree
    this.sceneGeometry = new THREE.Group();
    this.sceneGeometry.name = 'Geometry';
    this.scene.add(this.sceneGeometry);

    // Event scene tree
    this.sceneEvent = new THREE.Group();
    this.sceneEvent.name = 'Event';
    this.scene.add(this.sceneEvent);

    // Lights scene tree
    this.sceneHelpers = new THREE.Group();
    this.sceneHelpers.name = 'Helpers';
    this.scene.add(this.sceneHelpers);

    // BVH helper
    // this.boundsViz = new MeshBVHHelper( knots[ 0 ] );
    // containerObj.add( boundsViz );

    // Create cameras
    this.perspectiveCamera = new THREE.PerspectiveCamera(60, 1, 10, 40000);
    this.perspectiveCamera.position.set(-7000, 0 , 0);

    // Better orthographic camera initialization
    const orthoSize = 1000; // Start with a large enough size to see the detector
    this.orthographicCamera = new THREE.OrthographicCamera(
      -orthoSize, orthoSize,
      orthoSize, -orthoSize,
      -10000, 40000 // Critical change: Allow negative near plane to see objects behind camera position
    );
    this.orthographicCamera.position.copy(this.perspectiveCamera.position);
    this.orthographicCamera.lookAt(this.scene.position);


    // Default camera is perspective
    this.camera = this.perspectiveCamera;


    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.localClippingEnabled = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;


    // Append renderer to the container
    this.containerElement.appendChild(this.renderer.domElement);

    // Create OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = false;
    this.controls.dampingFactor = 0.05;


    // Perspective camera distance limits
    const sceneRadius = 5000;
    this.controls.minDistance = sceneRadius * 0.05;
    this.controls.maxDistance = sceneRadius * 3;
    this.camera.far = this.controls.maxDistance * 1.1;
    this.camera.updateProjectionMatrix();

    this.controls.update();

    // Setup lights
    this.setupLights();

    // Add default objects
    this.addDefaultObjects();

    // (!) We set initialized here, as at this point all main objects are created and configured
    // It is important not to set this flag at the function end as functions, such as setSize will check the flag
    this.initialized = true;

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
  }

  /**
   * If the service is already initialized (scene, camera, renderer exist),
   * you can re-attach the <canvas> to a container if it was removed or changed.
   */
  private attachRenderer(elem: HTMLElement): void {
    this.containerElement = elem;

    // If the canvas is not already in the DOM, re-append it.
    if (this.renderer?.domElement) {
      this.containerElement.appendChild(this.renderer.domElement);
    }
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
  }

  /**
   * Adds default objects to the scene.
   */
  private addDefaultObjects(): void {
    // const gridHelper = new THREE.GridHelper(1000, 100);
    // gridHelper.name = "Grid";
    // this.sceneHelpers.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(1500);
    axesHelper.name = "Axes";
    this.sceneHelpers.add(axesHelper);

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
   * The render loop: updates controls, executes frame callbacks, renders the scene, and schedules the next frame.
   */
  private renderLoop(): void {
    if (!this.shouldRender) {
      return;
    }

    this.animationFrameId = requestAnimationFrame(() => this.renderLoop());

    try {
      // Profiling start
      this.profileBeginFunc?.();
      this.perfService.updateStats(this.renderer);

      // Add frustum culling before rendering
      // this.frustumCuller.cullMeshes(this.scene, this.camera);

      // Update three components
      this.controls.update();
      this.renderer.render(this.scene, this.camera);

      // Run all custom/users callbacks
      for (const cb of this.frameCallbacks) {
        cb();
      }

      // Profiling end
      //TODO this.perfService.profileEnd(this.renderer);
      this.profileEndFunc?.();
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

    this.perspectiveCamera.aspect = width / height;
    this.perspectiveCamera.updateProjectionMatrix();

    this.orthographicCamera.left = width / -2;
    this.orthographicCamera.right = width / 2;
    this.orthographicCamera.top = height / 2;
    this.orthographicCamera.bottom = height / -2;
    this.orthographicCamera.updateProjectionMatrix();

    this.controls.update();
  }

  /**
   * Enables or disables local clipping.
   * @param enable Whether clipping should be enabled.
   */
  enableClipping(enable: boolean): void {
    this.renderer.localClippingEnabled = enable;

    // Update all materials to use clipping planes when enabled
    if (enable) {
      this.updateMaterialClipping();
    }
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

    // Enable clipping and update materials
    this.renderer.localClippingEnabled = true;
    this.updateMaterialClipping();
  }

  /**
   * Update all materials to use current clipping planes
   */
  private updateMaterialClipping(): void {
    const updateObjectClipping = (object: THREE.Object3D) => {
      if (object instanceof THREE.Mesh && object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];

        materials.forEach((material: THREE.Material) => {
          if (this.renderer.localClippingEnabled) {
            material.clippingPlanes = this.clipPlanes;
            material.clipIntersection = this.clipIntersection;
          } else {
            material.clippingPlanes = null;
            material.clipIntersection = false;
          }

          // Prevent z-fighting
          if (material instanceof THREE.MeshBasicMaterial ||
            material instanceof THREE.MeshLambertMaterial ||
            material instanceof THREE.MeshPhongMaterial ||
            material instanceof THREE.MeshStandardMaterial) {
            material.polygonOffset = true;
            material.polygonOffsetFactor = 1;
            material.polygonOffsetUnits = 1;
          }

          material.needsUpdate = true;
        });
      }
    };

    this.sceneGeometry.traverse(updateObjectClipping);
    this.sceneEvent.traverse(updateObjectClipping);
  }

  /**
   * Toggles between perspective and orthographic cameras.
   * @param useOrtho Whether to use the orthographic camera.
   */
  toggleOrthographicView(useOrtho: boolean): void {

    if (useOrtho) {
      // When switching to orthographic, sync position and target from perspective
      this.orthographicCamera.position.copy(this.perspectiveCamera.position);

      // Get the current target from OrbitControls
      const target = this.controls.target.clone();


      // Update orthographic camera to look in the same direction
      this.orthographicCamera.lookAt(target);

      // Calculate suitable frustum size based on distance to target
      const distance = this.orthographicCamera.position.distanceTo(target);
      const orthoSize = distance * Math.tan(THREE.MathUtils.degToRad(this.perspectiveCamera.fov / 2));

      // Update orthographic frustum based on aspect ratio
      const aspect = this.renderer.domElement.width / this.renderer.domElement.height;
      this.orthographicCamera.left = -orthoSize * aspect;
      this.orthographicCamera.right = orthoSize * aspect;
      this.orthographicCamera.top = orthoSize;
      this.orthographicCamera.bottom = -orthoSize;

      // Set a generous near/far plane range to ensure all geometry is visible
      this.orthographicCamera.near = -10000;
      this.orthographicCamera.far = 40000;

      this.orthographicCamera.updateProjectionMatrix();
      this.camera = this.orthographicCamera;
    } else {
      // Switch back to perspective camera
      this.camera = this.perspectiveCamera;
    }

    // Update the controls to use the current camera
    this.controls.object = this.camera;
    this.controls.update();

    this.cameraMode$.next(!useOrtho);
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
    this.clearHighlight();
    this.stopRendering();
    this.cleanupEventListeners();
    if(this.sceneGeometry) this.cleanupBVH(this.sceneGeometry);
    if(this.sceneEvent) this.cleanupBVH(this.sceneEvent);
  }


  logRendererInfo() {
    // Access the THREE.WebGLRenderer from threeService
    const renderer = this.renderer;
    const info = renderer.info;
    console.log('Draw calls:', info.render.calls);
    console.log('Triangles:', info.render.triangles);
    console.log('Points:', info.render.points);
    console.log('Lines:', info.render.lines);
    console.log('Geometries in memory:', info.memory.geometries);
    console.log('Textures in memory:', info.memory.textures);
    console.log('Programs:', info.programs?.length);
    console.log(info.programs);
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
    }
  }

  /**
   * Helper to check if a point is clipped by active clipping planes
   */
  private isPointClipped(point: THREE.Vector3): boolean {
    if (!this.renderer.localClippingEnabled || this.clipPlanes.length === 0) {
      return false;
    }

    for (const plane of this.clipPlanes) {
      const distance = plane.distanceToPoint(point);
      if (distance < 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Filter intersections based on clipping planes
   */
  private filterClippedIntersections(intersections: THREE.Intersection[]): THREE.Intersection[] {
    if (!this.renderer.localClippingEnabled || this.clipPlanes.length === 0) {
      return intersections;
    }

    return intersections.filter(intersection => !this.isPointClipped(intersection.point));
  }


  /**
   * Sets up the raycasting functionality with proper clipping support
   */
  private setupRaycasting(): void {
    const buildBVHIfNeeded = (obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh && obj.geometry && !obj.geometry.boundsTree) {
        // @ts-ignore
        obj.geometry.computeBoundsTree?.();
      }
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

        // Use proper canvas dimensions for coordinate calculation
        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();

        this.pointer.x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.camera);
        this.raycaster.firstHitOnly = false;
        this.raycaster.near = this.camera.near;
        this.raycaster.far = this.camera.far;

        this.sceneEvent.traverse(buildBVHIfNeeded);
        this.sceneGeometry.traverse(buildBVHIfNeeded);

        let intersection: THREE.Intersection | null = null;

        // Try sceneEvent first
        const hitsEvt = this.raycaster.intersectObjects(this.sceneEvent.children, true);
        const filteredEvtHits = this.filterClippedIntersections(hitsEvt);

        if (filteredEvtHits.length > 0) {
          intersection = filteredEvtHits[0];
        } else {
          // Fall back to geometry
          const hitsGeo = this.raycaster.intersectObjects(this.sceneGeometry.children, true);
          const filteredGeoHits = this.filterClippedIntersections(hitsGeo);

          if (filteredGeoHits.length > 0) {
            intersection = filteredGeoHits[0];
          }
        }

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

    //  Single click for selection only (no measurement, no preventDefault in selection mode)
    const onPointerDown = (event: PointerEvent) => {
      if (!this.isRaycastEnabled || this.measureMode) return;

      // Only handle left mouse button
      if (event.button !== 0) return;

      //  Don't prevent default for selection to allow OrbitControls
      // event.preventDefault(); // REMOVED

      const canvas = this.renderer.domElement;
      const rect = canvas.getBoundingClientRect();

      this.pointer.x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

      this.raycaster.setFromCamera(this.pointer, this.camera);
      this.raycaster.firstHitOnly = false;

      // Selection mode
      const hitsEvt = this.raycaster.intersectObjects(this.sceneEvent.children, true);
      const hitsGeo = this.raycaster.intersectObjects(this.sceneGeometry.children, true);

      const filteredEvtHits = this.filterClippedIntersections(hitsEvt);
      const filteredGeoHits = this.filterClippedIntersections(hitsGeo);

      const selected = filteredEvtHits[0] ?? filteredGeoHits[0];

      if (selected && selected.object.visible && selected.object.name &&
        selected.object.name !== 'HoverPoint' &&
        !selected.object.name.startsWith('MeasurePoint_')) {
        this.trackClicked.next({ track: selected.object, point: selected.point.clone() });
        console.log('[raycast] SELECTED', selected.object.name, selected.point);
      }
    };

    //  Double-click handler for distance measurement
    const onDoubleClick = (event: MouseEvent) => {
      if (!this.isRaycastEnabled || !this.measureMode) return;

      event.preventDefault();
      event.stopPropagation();

      const canvas = this.renderer.domElement;
      const rect = canvas.getBoundingClientRect();

      this.pointer.x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

      this.raycaster.setFromCamera(this.pointer, this.camera);
      this.raycaster.firstHitOnly = false;

      // Measure mode - double click
      const hitsEvt = this.raycaster.intersectObjects(this.sceneEvent.children, true);
      const hitsGeo = this.raycaster.intersectObjects(this.sceneGeometry.children, true);

      const filteredEvtHits = this.filterClippedIntersections(hitsEvt);
      const filteredGeoHits = this.filterClippedIntersections(hitsGeo);

      const picked = filteredEvtHits[0] ?? filteredGeoHits[0];

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

    //  Clean up existing listeners before adding new ones
    this.cleanupEventListeners();

    // Store references and attach listeners
    this.pointerMoveHandler = onPointerMove;
    this.pointerDownHandler = onPointerDown;
    this.doubleClickHandler = onDoubleClick;

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', this.pointerMoveHandler, false);
    canvas.addEventListener('pointerdown', this.pointerDownHandler, false);
    canvas.addEventListener('dblclick', this.doubleClickHandler, false);
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
  }

  /**
   * Clean up event listeners
   */
  private cleanupEventListeners(): void {

    if(!this.renderer?.domElement) {
      return;
    }
    const canvas = this.renderer.domElement;

    if (this.pointerMoveHandler) {
      canvas.removeEventListener('pointermove', this.pointerMoveHandler);
      this.pointerMoveHandler = undefined;
    }
    if (this.pointerDownHandler) {
      canvas.removeEventListener('pointerdown', this.pointerDownHandler);
      this.pointerDownHandler = undefined;
    }
    if (this.doubleClickHandler) {
      canvas.removeEventListener('dblclick', this.doubleClickHandler);
      this.doubleClickHandler = undefined;
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
