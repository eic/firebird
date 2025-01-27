// PhoenixThreeFacade.ts

import * as THREE from "three";
import { EventDisplay, RendererManager } from "phoenix-event-display";
import { EventDisplayService } from "phoenix-ui-components";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

/**
 * PhoenixThreeFacade serves as a facade to encapsulate and abstract
 * the functionalities provided by phoenix-event-display and phoenix-ui-components.
 * It provides a flat API for interacting with Three.js components.
 */
export class PhoenixThreeFacade {

  private eventDisplay: EventDisplay;
  private threeManager: any; // Replace 'any' with the actual type if available
  private rendererManager: RendererManager;

  /**
   * Constructor initializes the facade with an instance of EventDisplay.
   * @param eventDisplay An instance of EventDisplay from phoenix-event-display.
   */
  constructor(eventDisplay: EventDisplay) {
    this.eventDisplay = eventDisplay;
    this.threeManager = this.eventDisplay.getThreeManager();
    this.rendererManager = this.threeManager.rendererManager as RendererManager;
  }

  /**
   * Retrieves the Three.js Scene.
   * @returns The current THREE.Scene instance.
   */
  public getScene(): THREE.Scene {
    return this.threeManager.getSceneManager().getScene();
  }

  /**
   * Retrieves all geometries in the scene.
   * @returns An array of THREE.Geometry or THREE.BufferGeometry instances.
   */
  public getSceneGeometries(): any {
    return this.threeManager.getSceneManager().getGeometries();
  }

  /**
   * Retrieves the main Three.js Renderer.
   * @returns The main THREE.WebGLRenderer instance.
   */
  public getMainRenderer(): THREE.WebGLRenderer {
    return this.rendererManager.getMainRenderer();
  }

  /**
   * Retrieves the main camera used in the scene.
   * @returns The main THREE.Camera instance.
   */
  public getMainCamera(): THREE.Camera {
    return this.threeManager.controlsManager.getMainCamera();
  }

  /**
   * Retrieves the currently active camera.
   * @returns The active THREE.Camera instance.
   */
  public getActiveCamera(): THREE.Camera {
    return this.threeManager.controlsManager.getActiveCamera();
  }

  /**
   * Retrieves the active OrbitControls instance.
   * @returns The active OrbitControls instance.
   */
  public getActiveOrbitControls(): OrbitControls {
    return this.threeManager.controlsManager.getActiveControls() as OrbitControls;
  }

  /**
   * Retrieves the event data associated with the scene.
   * @returns The current event data.
   */
  public getSceneEventData(): any { // Replace 'any' with the actual event data type
    return this.threeManager.getSceneManager().getEventData();
  }

  /**
   * Sets the size of the renderer and updates the camera projections.
   * @param width The new width in pixels.
   * @param height The new height in pixels.
   */
  public setSize(width: number, height: number): void {

    // Update Perspective Camera
    if (!this.threeManager.isOrthographic && this.getMainCamera() instanceof THREE.PerspectiveCamera) {
      const perspectiveCamera = this.getMainCamera() as THREE.PerspectiveCamera;
      perspectiveCamera.aspect = width / height;
      perspectiveCamera.updateProjectionMatrix();
    }

    // Update Orthographic Camera if applicable
    if (this.threeManager.isOrthographic && this.getMainCamera() instanceof THREE.OrthographicCamera) {
      const orthographicCamera = this.getMainCamera() as THREE.OrthographicCamera;
      const frustumSize = 2000;
      const aspect = width / height;
      orthographicCamera.left = (-frustumSize * aspect) / 2;
      orthographicCamera.right = (frustumSize * aspect) / 2;
      orthographicCamera.top = frustumSize / 2;
      orthographicCamera.bottom = -frustumSize / 2;
      orthographicCamera.updateProjectionMatrix();
    }

    // Update OrbitControls
    this.getActiveOrbitControls().update();
  }

  /**
   * Starts the animation loop for rendering the scene.
   */
  public animate(): void {
    const animateLoop = () => {
      requestAnimationFrame(animateLoop);
      this.getMainRenderer().render(this.getScene(), this.getMainCamera());
    };
    animateLoop();
  }

  /**
   * Adds a mesh to the scene.
   * @param geometry The geometry of the mesh.
   * @param material The material of the mesh.
   * @returns The created THREE.Mesh instance.
   */
  public addMesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    this.getScene().add(mesh);
    return mesh;
  }

  /**
   * Removes a mesh from the scene.
   * @param mesh The THREE.Mesh instance to remove.
   */
  public removeMesh(mesh: THREE.Mesh): void {
    this.getScene().remove(mesh);
  }

  /**
   * Clears all objects from the scene.
   */
  public clearScene(): void {
    while (this.getScene().children.length > 0) {
      this.getScene().remove(this.getScene().children[0]);
    }
  }

  /**
   * Retrieves the Three.js Manager instance.
   * @returns The ThreeManager instance.
   */
  public getThreeManager(): any { // Replace 'any' with the actual ThreeManager type
    return this.threeManager;
  }

  /**
   * Retrieves the RendererManager instance.
   * @returns The RendererManager instance.
   */
  public getRendererManager(): RendererManager {
    return this.rendererManager;
  }

  /**
   * Switches between Perspective and Orthographic cameras.
   * @param useOrthographic If true, switches to Orthographic camera; otherwise, Perspective.
   */
  public switchCameraMode(useOrthographic: boolean): void {
    this.threeManager.isOrthographic = useOrthographic;
    this.threeManager.controlsManager.switchCameraMode(useOrthographic);
    this.setSize(this.getMainRenderer().domElement.clientWidth, this.getMainRenderer().domElement.clientHeight);
  }

  /**
   * Toggles the visibility of the grid helper in the scene.
   * @param visible If true, shows the grid; otherwise, hides it.
   */
  public toggleGridHelper(visible: boolean): void {
    const gridHelper = this.getScene().getObjectByName("GridHelper") as THREE.GridHelper;
    if (gridHelper) {
      gridHelper.visible = visible;
    } else if (visible) {
      const newGridHelper = new THREE.GridHelper(1000, 100);
      newGridHelper.name = "GridHelper";
      this.getScene().add(newGridHelper);
    }
  }

  /**
   * Adds a point light to the scene.
   * @param color The color of the light.
   * @param intensity The intensity of the light.
   * @param distance The maximum range of the light.
   * @returns The created THREE.PointLight instance.
   */
  public addPointLight(color: number, intensity: number, distance: number): THREE.PointLight {
    const pointLight = new THREE.PointLight(color, intensity, distance);
    this.getScene().add(pointLight);
    return pointLight;
  }

  /**
   * Removes a light from the scene.
   * @param light The THREE.Light instance to remove.
   */
  public removeLight(light: THREE.Light): void {
    this.getScene().remove(light);
  }

  /**
   * Updates the renderer's pixel ratio.
   * @param ratio The new pixel ratio.
   */
  public setPixelRatio(ratio: number): void {
    this.getMainRenderer().setPixelRatio(ratio);
  }

  /**
   * Enables or disables antialiasing in the renderer.
   * Note: Changing antialiasing on the fly may require reinitializing the renderer.
   * @param enabled If true, enables antialiasing; otherwise, disables it.
   */
  public toggleAntialiasing(enabled: boolean): void {
    // Antialiasing cannot be toggled on the fly; requires reinitialization.
    // This method can be implemented to recreate the renderer if needed.
    console.warn("Antialiasing toggle not implemented. Requires renderer reinitialization.");
  }

  /**
   * Updates the background color of the scene.
   * @param color The new background color as a hexadecimal number.
   */
  public setBackgroundColor(color: number): void {
    this.getScene().background = new THREE.Color(color);
  }

  /**
   * Adds an axis helper to the scene.
   * @param size The length of the axes.
   * @returns The created THREE.AxesHelper instance.
   */
  public addAxesHelper(size: number = 5): THREE.AxesHelper {
    const axesHelper = new THREE.AxesHelper(size);
    this.getScene().add(axesHelper);
    return axesHelper;
  }

  /**
   * Removes the axis helper from the scene.
   * @param axesHelper The THREE.AxesHelper instance to remove.
   */
  public removeAxesHelper(axesHelper: THREE.AxesHelper): void {
    this.getScene().remove(axesHelper);
  }

  /**
   * Adds a fog effect to the scene.
   * @param color The color of the fog.
   * @param near The near distance where the fog starts.
   * @param far The far distance where the fog fully obscures objects.
   */
  public addFog(color: number, near: number, far: number): void {
    this.getScene().fog = new THREE.Fog(color, near, far);
  }

  /**
   * Removes the fog effect from the scene.
   */
  public removeFog(): void {
    this.getScene().fog = null;
  }

  /**
   * Switches the active camera.
   * @param camera The THREE.Camera instance to activate.
   */
  public switchActiveCamera(camera: THREE.Camera): void {
    this.threeManager.controlsManager.setActiveCamera(camera);
    this.setSize(this.getMainRenderer().domElement.clientWidth, this.getMainRenderer().domElement.clientHeight);
  }

  /**
   * Retrieves the current pixel ratio of the renderer.
   * @returns The pixel ratio as a number.
   */
  public getPixelRatio(): number {
    return this.getMainRenderer().getPixelRatio();
  }

  /**
   * Retrieves the current aspect ratio of the main camera.
   * @returns The aspect ratio as a number.
   */
  public getCameraAspectRatio(): number {
    const camera = this.getMainCamera();
    if (camera instanceof THREE.PerspectiveCamera) {
      return camera.aspect;
    }
    return 1; // Default aspect ratio for non-perspective cameras
  }

  /**
   * Updates the camera's field of view.
   * @param fov The new field of view in degrees.
   */
  public updateCameraFOV(fov: number): void {
    const camera = this.getMainCamera();
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  /**
   * Enables or disables shadows in the renderer.
   * @param enabled If true, enables shadows; otherwise, disables them.
   */
  public toggleShadows(enabled: boolean): void {
    this.getMainRenderer().shadowMap.enabled = enabled;
  }

  /**
   * Adds a grid helper to the scene.
   * @param size The size of the grid.
   * @param divisions The number of divisions in the grid.
   * @returns The created THREE.GridHelper instance.
   */
  public addGridHelper(size: number = 10, divisions: number = 10): THREE.GridHelper {
    const gridHelper = new THREE.GridHelper(size, divisions);
    gridHelper.name = "GridHelper";
    this.getScene().add(gridHelper);
    return gridHelper;
  }

  /**
   * Removes the grid helper from the scene.
   */
  public removeGridHelper(): void {
    const gridHelper = this.getScene().getObjectByName("GridHelper") as THREE.GridHelper;
    if (gridHelper) {
      this.getScene().remove(gridHelper);
    }
  }

  /**
   * Retrieves the current aspect ratio of the active camera.
   * @returns The aspect ratio as a number.
   */
  public getActiveCameraAspectRatio(): number {
    const camera = this.getActiveCamera();
    if (camera instanceof THREE.PerspectiveCamera) {
      return camera.aspect;
    }
    return 1; // Default aspect ratio for non-perspective cameras
  }

  /**
   * Retrieves the current renderer size.
   * @returns An object containing width and height in pixels.
   */
  public getRendererSize(): { width: number; height: number } {
    return {
      width: this.getMainRenderer().domElement.clientWidth,
      height: this.getMainRenderer().domElement.clientHeight,
    };
  }

  /**
   * Updates the renderer's size based on provided dimensions.
   * @param width The new width in pixels.
   * @param height The new height in pixels.
   */
  public updateRendererSize(width: number, height: number): void {
    this.setSize(width, height);
  }

  /**
   * Enables or disables the visibility of OrbitControls.
   * @param enabled If true, enables OrbitControls; otherwise, disables them.
   */
  public toggleOrbitControls(enabled: boolean): void {
    this.getActiveOrbitControls().enabled = enabled;
  }

  /**
   * Sets the target point for OrbitControls to look at.
   * @param x The x-coordinate of the target.
   * @param y The y-coordinate of the target.
   * @param z The z-coordinate of the target.
   */
  public setOrbitControlsTarget(x: number, y: number, z: number): void {
    this.getActiveOrbitControls().target.set(x, y, z);
    this.getActiveOrbitControls().update();
  }

  /**
   * Retrieves the current target point of OrbitControls.
   * @returns An instance of THREE.Vector3 representing the target point.
   */
  public getOrbitControlsTarget(): THREE.Vector3 {
    return this.getActiveOrbitControls().target.clone();
  }

  /**
   * Adds ambient light to the scene.
   * @param color The color of the ambient light.
   * @param intensity The intensity of the ambient light.
   * @returns The created THREE.AmbientLight instance.
   */
  public addAmbientLight(color: number, intensity: number): THREE.AmbientLight {
    const ambientLight = new THREE.AmbientLight(color, intensity);
    this.getScene().add(ambientLight);
    return ambientLight;
  }

  /**
   * Removes ambient light from the scene.
   * @param ambientLight The THREE.AmbientLight instance to remove.
   */
  public removeAmbientLight(ambientLight: THREE.AmbientLight): void {
    this.getScene().remove(ambientLight);
  }

  /**
   * Adds a directional light to the scene.
   * @param color The color of the directional light.
   * @param intensity The intensity of the directional light.
   * @param position The position of the directional light.
   * @returns The created THREE.DirectionalLight instance.
   */
  public addDirectionalLight(color: number, intensity: number, position: THREE.Vector3): THREE.DirectionalLight {
    const directionalLight = new THREE.DirectionalLight(color, intensity);
    directionalLight.position.copy(position);
    this.getScene().add(directionalLight);
    return directionalLight;
  }

  /**
   * Removes a directional light from the scene.
   * @param directionalLight The THREE.DirectionalLight instance to remove.
   */
  public removeDirectionalLight(directionalLight: THREE.DirectionalLight): void {
    this.getScene().remove(directionalLight);
  }

  /**
   * Adds a custom object to the scene.
   * @param object The THREE.Object3D instance to add.
   */
  public addObject(object: THREE.Object3D): void {
    this.getScene().add(object);
  }

  /**
   * Removes a custom object from the scene.
   * @param object The THREE.Object3D instance to remove.
   */
  public removeObject(object: THREE.Object3D): void {
    this.getScene().remove(object);
  }

  /**
   * Updates the position of the main camera.
   * @param x The x-coordinate.
   * @param y The y-coordinate.
   * @param z The z-coordinate.
   */
  public updateCameraPosition(x: number, y: number, z: number): void {
    const camera = this.getMainCamera();
    camera.position.set(x, y, z);
    camera.updateMatrix();
    this.getActiveOrbitControls().update();
  }

  /**
   * Rotates the main camera around a specified axis.
   * @param axis The axis to rotate around (e.g., 'x', 'y', 'z').
   * @param angle The angle in radians.
   */
  public rotateCamera(axis: 'x' | 'y' | 'z', angle: number): void {
    const camera = this.getMainCamera();
    camera.rotateOnAxis(new THREE.Vector3(
      axis === 'x' ? 1 : 0,
      axis === 'y' ? 1 : 0,
      axis === 'z' ? 1 : 0
    ), angle);
    camera.updateMatrix();
    this.getActiveOrbitControls().update();
  }

  /**
   * Switches the active camera to a new camera.
   * @param newCamera The THREE.Camera instance to switch to.
   */
  public switchActiveCameraTo(newCamera: THREE.Camera): void {
    this.threeManager.controlsManager.setActiveCamera(newCamera);
    this.setSize(this.getMainRenderer().domElement.clientWidth, this.getMainRenderer().domElement.clientHeight);
  }

  /**
   * Retrieves the list of all objects in the scene.
   * @returns An array of THREE.Object3D instances.
   */
  public getAllObjects(): THREE.Object3D[] {
    return this.getScene().children;
  }

  /**
   * Finds an object in the scene by its name.
   * @param name The name of the object to find.
   * @returns The found THREE.Object3D instance or undefined if not found.
   */
  public findObjectByName(name: string): THREE.Object3D | undefined {
    return this.getScene().getObjectByName(name);
  }

  /**
   * Adds a custom event listener to the scene.
   * @param event The event name.
   * @param callback The callback function to execute when the event occurs.
   */
  public addEventListener(event: string, callback: (...args: any[]) => void): void {
    this.getScene().addEventListener(event, callback);
  }

  /**
   * Removes a custom event listener from the scene.
   * @param event The event name.
   * @param callback The callback function to remove.
   */
  public removeEventListener(event: string, callback: (...args: any[]) => void): void {
    this.getScene().removeEventListener(event, callback);
  }


  /**
   * Initializes the scene with default settings.
   */
  public initializeScene(): void {
    this.setBackgroundColor(0x000000); // Set default background to black
    this.addGridHelper();
    this.addAxesHelper();
    this.addAmbientLight(0xffffff, 0.5);
    this.addPointLight(0xffffff, 1, 100);
    this.addDirectionalLight(0xffffff, 1, new THREE.Vector3(10, 10, 10));
  }

  /**
   * Cleans up the scene by removing all objects and resetting settings.
   */
  public cleanupScene(): void {
    this.clearScene();
    this.setBackgroundColor(0x000000);
    this.toggleShadows(false);
    this.removeFog();
  }

  /**
   * Enables or disables the renderer's animation loop.
   * @param enabled If true, starts the animation loop; otherwise, stops it.
   */
  public toggleAnimationLoop(enabled: boolean): void {
    if (enabled) {
      this.animate();
    } else {
      // Implement stopping the animation loop if necessary
      console.warn("Animation loop toggle to stop not implemented.");
    }
  }

  /**
   * Sets the renderer's clear color.
   * @param color The clear color as a hexadecimal number.
   * @param alpha The alpha value for the clear color.
   */
  public setClearColor(color: number, alpha: number = 1): void {
    this.getMainRenderer().setClearColor(color, alpha);
  }

  /**
   * Enables or disables antialiasing by reinitializing the renderer.
   * Note: This will remove and re-add the canvas to the DOM.
   * @param enabled If true, enables antialiasing; otherwise, disables it.
   */
  public enableAntialiasing(enabled: boolean): void {
    // Reinitialize the renderer with the desired antialiasing setting
    const currentCanvas = this.getMainRenderer().domElement;
    const parent = currentCanvas.parentElement;

    if (parent) {
      // Remove the old renderer's canvas
      parent.removeChild(currentCanvas);

      // Create a new renderer with the updated antialiasing setting
      const newRenderer = new THREE.WebGLRenderer({
        antialias: enabled,
        canvas: currentCanvas,
      });
      newRenderer.setSize(currentCanvas.clientWidth, currentCanvas.clientHeight);
      newRenderer.setPixelRatio(window.devicePixelRatio);

      // Update the renderer manager
      this.rendererManager.setMainRenderer(newRenderer);

      // Re-add the canvas to the DOM
      parent.appendChild(currentCanvas);

      // Update the camera aspect ratio
      this.setSize(currentCanvas.clientWidth, currentCanvas.clientHeight);
    } else {
      console.error("RendererManager: Unable to find the canvas parent element.");
    }
  }
}
