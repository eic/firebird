import { Injectable, NgZone, OnDestroy } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { HemisphereLight, DirectionalLight, AmbientLight, PointLight, SpotLight } from 'three';

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

  private isOrthographic: boolean = false;

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

  constructor(private ngZone: NgZone) {
    // Empty constructor – initialization happens in init()
  }

  /**
   * Initializes the Three.js scene, camera, renderer, controls, and lights.
   * Must be called before any other method.
   * @param container A string representing the ID of the HTML element,
   *                  or the actual HTMLElement where the renderer will attach.
   */
  init(container: string | HTMLElement): void {
    if (this.initialized) {
      console.warn('ThreeService has already been initialized.');
      return;
    }

    // Allow passing either a container ID or an element directly
    if (typeof container === 'string') {
      const el = document.getElementById(container);
      if (!el) {
        throw new Error(`ThreeService Initialization Error: Container element #${container} not found.`);
      }
      this.containerElement = el;
    } else {
      this.containerElement = container;
    }

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
    this.perspectiveCamera = new THREE.PerspectiveCamera(60, 1, 1, 40000);
    this.perspectiveCamera.position.set(0, 100, 200);

    this.orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
    this.orthographicCamera.position.copy(this.perspectiveCamera.position);
    this.orthographicCamera.lookAt(this.scene.position);

    // Default camera is perspective
    this.camera = this.perspectiveCamera;
    this.isOrthographic = false;

    // 3) Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.localClippingEnabled = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Append renderer to the container
    this.containerElement.appendChild(this.renderer.domElement);

    // 4) Create OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.update();

    // 5) Set initial size
    const width = this.containerElement.clientWidth;
    const height = this.containerElement.clientHeight;
    this.setSize(width, height);

    // 6) Setup lights
    this.setupLights();

    // 7) Add default objects
    this.addDefaultObjects();

    this.initialized = true;
    this.startRendering();
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
    const gridHelper = new THREE.GridHelper(1000, 100);
    gridHelper.name = "Grid";
    this.sceneHelpers.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(500);
    axesHelper.name = "Axes";
    this.sceneHelpers.add(axesHelper);

    const geometry = new THREE.BoxGeometry(100, 100, 100);
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    cube.name = "TestCube"
    cube.castShadow = true;
    cube.receiveShadow = true;
    this.sceneGeometry.add(cube);
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
      this.profileBeginFunc?.();
      for (const cb of this.frameCallbacks) {
        cb();
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
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
    this.ensureInitialized('addFrameCallback');
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
    this.ensureInitialized('removeFrameCallback');
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

    this.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        const matArray = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        matArray.forEach((mat: THREE.Material) => {
          mat.clippingPlanes = this.clipPlanes;
          mat.clipIntersection = this.clipIntersection;
        });
      }
    });
  }

  /**
   * Toggles between perspective and orthographic cameras.
   * @param useOrtho Whether to use the orthographic camera.
   */
  toggleOrthographicView(useOrtho: boolean): void {
    this.isOrthographic = useOrtho;
    this.camera = useOrtho ? this.orthographicCamera : this.perspectiveCamera;
    this.controls.object = this.camera;
    this.controls.update();
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
  }
}
