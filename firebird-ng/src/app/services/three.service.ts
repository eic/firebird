// three.service.ts
import { Injectable, NgZone, OnDestroy } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

/**
 * This service sets up a Three.js scene, camera, renderer, and OrbitControls.
 * It also manages a single animation loop with user-defined callbacks.
 */
@Injectable({
  providedIn: 'root',
})
export class ThreeService implements OnDestroy {
  /** Three.js core components */
  public scene!: THREE.Scene;
  public renderer!: THREE.WebGLRenderer;
  public controls!: OrbitControls;

  /** Cameras */
  private perspectiveCamera!: THREE.PerspectiveCamera;
  private orthographicCamera!: THREE.OrthographicCamera;
  public camera!: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  // Track which camera is active
  private isOrthographic: boolean = false;

  /** Animation loop control */
  private animationFrameId: number | null = null;
  private shouldRender = false;

  /** Callbacks to run each frame before rendering. */
  private frameCallbacks: Array<() => void> = [];

  /** Optional clipping planes and logic. */
  private clipPlanes = [
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  ];
  private clipIntersection: boolean = false;

  /** Initialization flag */
  private initialized: boolean = false;

  /** Reference to the container element used for rendering */
  private containerElement!: HTMLElement;

  constructor(private ngZone: NgZone) {
    // Constructor is empty to avoid premature initialization
  }

  /**
   * Initializes the Three.js scene, camera, renderer, and controls.
   * Must be called before any other method.
   * @param containerId The ID of the HTML element where the renderer will attach.
   */
  init(containerId: string): void {
    if (this.initialized) {
      console.warn('ThreeService has already been initialized.');
      return;
    }

    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(
        `ThreeService Initialization Error: Container element #${containerId} not found.`
      );
    }
    this.containerElement = container as HTMLElement;

    // 1) Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3f3f3f);

    // 2) Create cameras
    // Initial size will be set via setSize
    this.perspectiveCamera = new THREE.PerspectiveCamera(
      75,
      1, // temporary aspect, to be updated
      0.1,
      20000
    );
    this.perspectiveCamera.position.set(0, 0, 1000); // Example default position

    // Orthographic Camera
    this.orthographicCamera = new THREE.OrthographicCamera(
      -1,
      1,
      1,
      -1,
      0.1,
      20000
    );
    this.orthographicCamera.position.copy(this.perspectiveCamera.position);
    this.orthographicCamera.lookAt(this.scene.position);

    // Default camera is perspective
    this.camera = this.perspectiveCamera;
    this.isOrthographic = false;

    // 3) Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.localClippingEnabled = false; // Enable if using clipping
    this.containerElement.appendChild(this.renderer.domElement);

    // 4) Create OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    // 5) Set initial size
    const width = this.containerElement.clientWidth;
    const height = this.containerElement.clientHeight;
    this.setSize(width, height);

    // Set initialized flag
    this.initialized = true;
  }

  /**
   * Starts the rendering loop. Ensures that the service is initialized before starting.
   */
  startRendering(): void {
    this.ensureInitialized('startRendering');

    if (this.animationFrameId !== null) {
      // Already running
      console.warn('ThreeService: Rendering loop is already running.');
      return;
    }

    this.shouldRender = true;

    // Run outside Angular to prevent unnecessary change detection
    this.ngZone.runOutsideAngular(() => {
      this.renderLoop();
    });
  }

  /**
   * Stop the render loop if it's running.
   */
  stopRendering(): void {
    this.shouldRender = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * The core render loop: updates controls, runs callbacks, renders the scene,
   * then schedules the next frame if shouldRender is still true.
   */
  private renderLoop(): void {
    if (!this.shouldRender) {
      return;
    }

    // Schedule the next frame before performing operations
    this.animationFrameId = requestAnimationFrame(() => this.renderLoop());

    try {
      // 1) Run user-defined callbacks
      for (const cb of this.frameCallbacks) {
        cb();
      }

      // 2) Update controls
      this.controls.update();

      // 3) Render the scene
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      console.error('(!!!) ThreeService Render Loop Error:', error);
      // Optionally stop the loop if an error occurs
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
      console.warn(
        'ThreeService: Attempted to add a duplicate frame callback.'
      );
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
      console.warn(
        'ThreeService: Attempted to remove a non-existent frame callback.'
      );
    }
  }

  /**
   * Sets the size of the renderer and updates the camera projections accordingly.
   * Should be called whenever the available size for the canvas changes.
   * @param width The new width in pixels.
   * @param height The new height in pixels.
   */
  setSize(width: number, height: number): void {
    if (!this.initialized) {
      console.error('ThreeService: setSize called before initialization.');
      return;
    }

    this.renderer.setSize(width, height);

    // Update Perspective Camera
    if (!this.isOrthographic && this.camera === this.perspectiveCamera) {
      this.perspectiveCamera.aspect = width / height;
      this.perspectiveCamera.updateProjectionMatrix();
    }

    // Update Orthographic Camera
    if (this.isOrthographic && this.camera === this.orthographicCamera) {
      const frustumSize = 2000;
      const aspect = width / height;
      this.orthographicCamera.left = (-frustumSize * aspect) / 2;
      this.orthographicCamera.right = (frustumSize * aspect) / 2;
      this.orthographicCamera.top = frustumSize / 2;
      this.orthographicCamera.bottom = -frustumSize / 2;
      this.orthographicCamera.updateProjectionMatrix();
    }

    // Update OrbitControls
    this.controls.update();
  }

  /* ---------------------------
   * CLIPPING LOGIC (optional)
   * ---------------------------
   * If you want 2-plane clipping from your old Phoenix usage:
   */

  enableClipping(enable: boolean) {
    this.renderer.localClippingEnabled = enable;
  }

  /**
   * Two-plane clipping logic. Rotates two planes around Z axis by start + opening angles.
   */
  setClippingAngle(startAngleDeg: number, openingAngleDeg: number) {
    const planeA = this.clipPlanes[0];
    const planeB = this.clipPlanes[1];

    this.clipIntersection = openingAngleDeg < 180;

    // Convert degrees to radians
    const startAngle = (startAngleDeg * Math.PI) / 180;
    const openingAngle = (openingAngleDeg * Math.PI) / 180;

    // Rotate planeA
    const quatA = new THREE.Quaternion();
    quatA.setFromAxisAngle(new THREE.Vector3(0, 0, 1), startAngle);
    planeA.normal.set(0, -1, 0).applyQuaternion(quatA);

    // Rotate planeB
    const quatB = new THREE.Quaternion();
    quatB.setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      startAngle + openingAngle
    );
    planeB.normal.set(0, 1, 0).applyQuaternion(quatB);

    // Optionally update materials
    this.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        const matArray = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        matArray.forEach((mat: THREE.Material) => {
          mat.clippingPlanes = this.clipPlanes;
          mat.clipIntersection = this.clipIntersection;
        });
      }
    });
  }

  /**
   * Toggles between perspective and orthographic cameras.
   */
  toggleOrthographicView(useOrtho: boolean): void {
    this.isOrthographic = useOrtho;

    // Switch camera reference
    this.camera = useOrtho ? this.orthographicCamera : this.perspectiveCamera;

    // Update OrbitControls to use the new camera
    this.controls.object = this.camera;
    this.controls.update();
  }

  /**
   * Ensures that the service has been initialized before performing operations.
   * Logs an error and optionally throws an exception if not initialized.
   * @param methodName Name of the method performing the check.
   */
  private ensureInitialized(methodName: string): void {
    if (!this.initialized) {
      const errorMsg = `ThreeService Error: Method '${methodName}' called before initialization. Call 'init(containerId)' first.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * On service destroy, stop the render loop and perform any necessary cleanup.
   */
  ngOnDestroy(): void {
    this.stopRendering();
    // Additional cleanup if necessary
  }
}
