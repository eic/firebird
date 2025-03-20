import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { ThreeService } from './three.service';

/**
 * A simple service that keeps references to "helper" objects:
 * - Axis lines
 * - EtaPhi grids
 * - Cartesian grids
 * - 3D points picking
 * And exposes methods to toggle them on/off or move them.
 */
@Injectable({ providedIn: 'root' })
export class SceneHelpersService {
  private axisHelper: THREE.AxesHelper | null = null;
  private cartesianGridGroup: THREE.Group | null = null;
  private etaPhiGridGroup: THREE.Group | null = null;
  private labelsGroup: THREE.Group | null = null;

  // For "show distance" or "show 3D coords" logic:
  private onPointerMoveFn?: (event: MouseEvent) => void;
  private onPointerClickFn?: (event: MouseEvent) => void;

  constructor(private threeService: ThreeService) {}

  /**
   * Creates or toggles the axis lines. This uses a built-in AxesHelper or your custom approach.
   */
  setShowAxis(show: boolean) {
    // If we haven't created it yet, do so
    if (!this.axisHelper) {
      this.axisHelper = new THREE.AxesHelper(2000);
      this.axisHelper.name = "Axis";
      this.threeService.scene.add(this.axisHelper);
    }
    this.axisHelper.visible = show;
  }

  /**
   * Show/hide a cartesian grid. This can be a built-in GridHelper or a custom approach.
   * `scale` can define size, or you can store a config in an object.
   */
  setShowCartesianGrid(show: boolean, scale: number, config?: {
    showXY: boolean;
    showYZ: boolean;
    showZX: boolean;
    xDistance: number;
    yDistance: number;
    zDistance: number;
    sparsity: number;
  }) {
    if (!this.cartesianGridGroup) {
      // Make a group with three GridHelpers, or do your custom geometry
      this.cartesianGridGroup = new THREE.Group();
      this.cartesianGridGroup.name = 'CartesianGridGroup';
      // For example, add a built-in GridHelper on XZ plane:
      const grid = new THREE.GridHelper(scale, 20, 0xffffff, 0xffffff);
      grid.rotation.x = Math.PI / 2; // to show XZ?
      this.cartesianGridGroup.add(grid);
      this.cartesianGridGroup.name = "CartesianGrid"
      // add YZ plane, XY plane, etc., if needed...
      this.threeService.scene.add(this.cartesianGridGroup);
    }
    // If you want to store the config for each plane, do it here.
    this.cartesianGridGroup.visible = show;
  }

  /**
   * Show/hide an “eta-phi” grid if you want that feature.
   * You can create a custom geometry or skip it.
   */
  setShowEtaPhiGrid(show: boolean) {
    if (!this.etaPhiGridGroup) {
      this.etaPhiGridGroup = new THREE.Group();
      this.etaPhiGridGroup.name = 'EtaPhiGrid';
      // Build your geometry or lines for an eta-phi representation
      // e.g., custom circles or lines
      this.threeService.scene.add(this.etaPhiGridGroup);
    }
    this.etaPhiGridGroup.visible = show;
  }

  /**
   * Show/hide labels. If you do 2D overlays, you might skip a 3D group for labels.
   * Or you can do a sprite-based approach or text geometry approach.
   */
  showLabels(show: boolean) {
    if (!this.labelsGroup) {
      this.labelsGroup = new THREE.Group();
      this.labelsGroup.name = 'Labels';
      this.threeService.scene.add(this.labelsGroup);
      // Add text mesh or sprites as needed.
    }
    this.labelsGroup.visible = show;
  }

  /**
   * Show/hide 3D mouse coordinates by hooking pointer events, running a Raycaster, etc.
   */
  show3DMousePoints(show: boolean) {
    if (show) {
      // Attach event listeners
      this.onPointerClickFn = (evt) => this.handle3DPointClick(evt);
      window.addEventListener('click', this.onPointerClickFn);
    } else {
      // Remove event listeners
      if (this.onPointerClickFn) {
        window.removeEventListener('click', this.onPointerClickFn);
        this.onPointerClickFn = undefined;
      }
    }
  }

  private handle3DPointClick(evt: MouseEvent) {
    // example of raycasting
    const rect = this.threeService.renderer.domElement.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.threeService.camera);

    const intersects = raycaster.intersectObjects(this.threeService.scene.children, true);
    if (intersects.length > 0) {
      const point = intersects[0].point;
      console.log('Clicked 3D coords:', point);
      // You could show an overlay or a small 3D marker, etc.
    }
  }

  /**
   * Toggle "show 3D distance" by hooking pointer events for measuring two points, etc.
   */
  show3DDistance(show: boolean) {
    // Similar approach: track the first click, second click, measure distance, show line, etc.
    console.warn('show3DDistance not implemented yet. You can replicate your old logic here.');
  }

  /**
   * SHIFT cartesian grid by pointer or by values. You can replicate the old logic.
   */
  shiftCartesianGridByPointer() {
    console.warn('shiftCartesianGridByPointer not implemented. You can replicate old logic here.');
  }

  translateCartesianGrid(shift: THREE.Vector3) {
    if (this.cartesianGridGroup) {
      this.cartesianGridGroup.position.add(shift);
    }
  }

  translateCartesianLabels(shift: THREE.Vector3) {
    // If you keep labels in a separate group or do 2D overlay, handle that here
  }

  // ...
  // Additional code for “preset camera views” if you want.
  setCameraView(targetPos: THREE.Vector3, cameraPos: THREE.Vector3) {
    // e.g. tween the camera, or set it instantly
    this.threeService.camera.position.copy(cameraPos);
    this.threeService.controls.target.copy(targetPos);
    this.threeService.controls.update();
  }
}
