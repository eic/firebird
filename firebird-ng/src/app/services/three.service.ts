import {EventEmitter, Injectable, NgZone, OnDestroy} from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { HemisphereLight, DirectionalLight, AmbientLight, PointLight, SpotLight } from 'three';
import {PerfService} from "./perf.service";
import {BehaviorSubject} from "rxjs";

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

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private isRaycastEnabled: boolean = false;


  private onPointerDownHandler!: (event: PointerEvent) => void;

  //Raycasting point for sceneEvent
  private hoverPoint: THREE.Mesh | null = null;

  private initHoverPoint() {
    const sphereGeom = new THREE.SphereGeometry(30, 160, 160);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.hoverPoint = new THREE.Mesh(sphereGeom, sphereMat);
    this.hoverPoint.visible = false;
    this.sceneEvent.add(this.hoverPoint);
  }

  constructor(
    private ngZone: NgZone,
    private perfService: PerfService) {
    // Empty constructor – initialization happens in init()
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

    // 2) Create cameras
    this.perspectiveCamera = new THREE.PerspectiveCamera(60, 1, 10, 40000);
    this.perspectiveCamera.position.set(0, 100, 200);
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

    //Raycasting
    // this.onPointerDownHandler = (event) => {
    //     const rect = this.renderer.domElement.getBoundingClientRect();
    //     this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    //     this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    //
    //     this.raycaster.setFromCamera(this.pointer, this.camera);
    //     const intersects = this.raycaster.intersectObjects(this.sceneGeometry.children, true);
    //     if (intersects.length > 0) {
    //       const firstHit = intersects[0].object;
    //       console.log('Clicked object:', intersects[0].object.name || 'Unnamed object');
    //     }
    // };
    //
    // this.renderer.domElement.addEventListener('pointerdown', this.onPointerDownHandler);

    // Append renderer to the container
    this.containerElement.appendChild(this.renderer.domElement);

    // Create OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
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

    this.raycastHandler();
    this.initHoverPoint();

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

    this.sceneGeometry.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        const matArray = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        matArray.forEach((mat: THREE.Material) => {
          mat.clippingPlanes = this.clipPlanes;
          mat.clipIntersection = this.clipIntersection;

          // Add these properties to prevent z-fighting and flickering
          if (mat instanceof THREE.MeshBasicMaterial ||
            mat instanceof THREE.MeshLambertMaterial ||
            mat instanceof THREE.MeshPhongMaterial ||
            mat instanceof THREE.MeshStandardMaterial) {
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = 1;
            mat.polygonOffsetUnits = 1;
          }
        });

      }
    });
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

      // Compute the direction vector from camera to target
      const direction = new THREE.Vector3().subVectors(target, this.orthographicCamera.position).normalize();

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
    this.stopRendering();
    // Additional cleanup if necessary
    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDownHandler);
    }
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

  toggleRaycast(): void {
    this.isRaycastEnabled = !this.isRaycastEnabled;
    console.log(`Raycast is now ${this.isRaycastEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  isRaycastEnabledState(): boolean {
    return this.isRaycastEnabled;
  }


  private raycastHandler(): void {

    this.renderer.domElement.addEventListener('mousedown', (event) => {

      event.preventDefault();
      event.stopPropagation();

      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointer, this.camera);

      // const allObjects = [
      //   ...this.sceneGeometry.children,
      //   ...this.sceneEvent.children
      // ];

      const intersects = this.raycaster.intersectObjects(this.sceneGeometry.children, true);

      if (intersects.length > 0) {
        console.log('Geometry intersected objects under cursor:');
        intersects.forEach((intersection) => {
          const hitObj = intersection.object;
          console.log('–', hitObj.name || 'Unnamed object');
        });
      } else {
        console.log('No intersection');
      }

    });

        // ==== Add after existing mousedown: ====
    this.renderer.domElement.addEventListener('pointermove', (event) => {
      if (!this.isRaycastEnabled) return;

      event.preventDefault();
      event.stopPropagation();

      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointer, this.camera);

      const intersectsEvent = this.raycaster.intersectObjects(this.sceneEvent.children, true);

      if (intersectsEvent.length > 0) {
        const closest = intersectsEvent[0];
        const hitTrack = closest.object;
        if (this.hoverPoint) {
          this.hoverPoint.visible = true;
          this.hoverPoint.position.copy(closest.point);
        }
        console.log(`Hovered track: ${hitTrack.name || 'Unnamed track'}`, hitTrack);
      } else {
        if (this.hoverPoint) {
          this.hoverPoint.visible = false;
        }
      }
    });

  }

}
