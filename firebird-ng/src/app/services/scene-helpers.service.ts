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
  private cartesianGridGroup: THREE.Group | null = null;
  private etaPhiGroup: THREE.Group | null = null;
  private labelsGroup: THREE.Group | null = null;

  // For "show distance" or "show 3D coords" logic:
  private onPointerMoveFn?: (event: MouseEvent) => void;
  private onPointerClickFn?: (event: MouseEvent) => void;

  constructor(private threeService: ThreeService) {}

  /**
   * Toggles the existing axes helper created in ThreeService.
   */
  setShowAxis(show: boolean) {
    if (this.threeService.axesHelper) {
      this.threeService.axesHelper.visible = show;
    }
  }

  /**
   * Show/hide a cartesian grid on the XZ plane at Y = -4000.
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
      this.cartesianGridGroup = new THREE.Group();
      this.cartesianGridGroup.name = 'CartesianGrid';
      // GridHelper creates a grid on the XZ plane by default
      const grid = new THREE.GridHelper(scale, 20, 0xffffff, 0x888888);
      grid.material = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.4 });
      this.cartesianGridGroup.add(grid);
      // Position at Y = -4000
      this.cartesianGridGroup.position.set(0, -4000, 0);
      this.threeService.sceneHelpers.add(this.cartesianGridGroup);
    }
    this.cartesianGridGroup.visible = show;
  }

  /**
   * Show/hide eta lines with labels for common HEP pseudorapidity values.
   * Eta lines are drawn as cones emanating from the origin in the XZ plane (beam axis = Z).
   */
  setShowEtaPhiGrid(show: boolean) {
    if (!this.etaPhiGroup) {
      this.etaPhiGroup = new THREE.Group();
      this.etaPhiGroup.name = 'EtaPhi';
      this.buildEtaLines(this.etaPhiGroup);
      this.threeService.sceneHelpers.add(this.etaPhiGroup);
    }
    this.etaPhiGroup.visible = show;
  }

  /**
   * Build lines for common eta values.
   * Pseudorapidity eta = -ln(tan(theta/2)), so theta = 2*atan(exp(-eta)).
   * In HEP convention: beam axis = Z, so a particle at angle theta from Z
   * travels in direction (sin(theta), 0, cos(theta)).
   */
  private buildEtaLines(group: THREE.Group) {
    // Common eta values for HEP collider detectors
    const etaValues = [-4, -3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4];
    const lineLength = 4000; // mm, extent of lines

    const material = new THREE.LineBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.6,
    });

    for (const eta of etaValues) {
      const theta = 2 * Math.atan(Math.exp(-eta));
      // Direction in (x, y, z) with beam along Z:
      // x = sin(theta), y = 0, z = cos(theta)
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(sinTheta * lineLength, 0, cosTheta * lineLength),
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);
      line.name = `eta_${eta}`;
      group.add(line);

      // Add label sprite at the end of the line
      const label = this.createTextSprite(`η=${eta}`, 0xffcc00);
      label.position.set(
        sinTheta * (lineLength + 200),
        0,
        cosTheta * (lineLength + 200)
      );
      label.name = `eta_label_${eta}`;
      group.add(label);
    }
  }

  /**
   * Show/hide X, Y, Z labels at the end of the axes helper.
   */
  showLabels(show: boolean) {
    if (!this.labelsGroup) {
      this.labelsGroup = new THREE.Group();
      this.labelsGroup.name = 'AxisLabels';

      const axisLength = 1500; // matches AxesHelper size in three.service
      const offset = 150; // offset past the axis end

      const xLabel = this.createTextSprite('X', 0xff0000);
      xLabel.position.set(axisLength + offset, 0, 0);
      this.labelsGroup.add(xLabel);

      const yLabel = this.createTextSprite('Y', 0x00ff00);
      yLabel.position.set(0, axisLength + offset, 0);
      this.labelsGroup.add(yLabel);

      const zLabel = this.createTextSprite('Z', 0x0000ff);
      zLabel.position.set(0, 0, axisLength + offset);
      this.labelsGroup.add(zLabel);

      this.threeService.sceneHelpers.add(this.labelsGroup);
    }
    this.labelsGroup.visible = show;
  }

  /**
   * Creates a sprite with text rendered on a canvas texture.
   */
  private createTextSprite(text: string, color: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, size, size);

    // Convert hex color to CSS string
    const cssColor = `#${color.toString(16).padStart(6, '0')}`;

    ctx.font = 'Bold 120px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cssColor;
    ctx.fillText(text, size / 2, size / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(200, 200, 1);
    sprite.name = `label_${text}`;
    return sprite;
  }

  /**
   * Show/hide 3D mouse coordinates by hooking pointer events, running a Raycaster, etc.
   */
  show3DMousePoints(show: boolean) {
    if (show) {
      this.onPointerClickFn = (evt) => this.handle3DPointClick(evt);
      window.addEventListener('click', this.onPointerClickFn);
    } else {
      if (this.onPointerClickFn) {
        window.removeEventListener('click', this.onPointerClickFn);
        this.onPointerClickFn = undefined;
      }
    }
  }

  private handle3DPointClick(evt: MouseEvent) {
    const rect = this.threeService.renderer.domElement.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.threeService.camera);

    const intersects = raycaster.intersectObjects(this.threeService.scene.children, true);
    if (intersects.length > 0) {
      const point = intersects[0].point;
      console.log('Clicked 3D coords:', point);
    }
  }

  /**
   * Toggle "show 3D distance" by hooking pointer events for measuring two points, etc.
   */
  show3DDistance(show: boolean) {
    console.warn('show3DDistance not implemented yet.');
  }

  /**
   * SHIFT cartesian grid by pointer or by values.
   */
  shiftCartesianGridByPointer() {
    console.warn('shiftCartesianGridByPointer not implemented.');
  }

  translateCartesianGrid(shift: THREE.Vector3) {
    if (this.cartesianGridGroup) {
      this.cartesianGridGroup.position.add(shift);
    }
  }

  translateCartesianLabels(shift: THREE.Vector3) {
    // If you keep labels in a separate group or do 2D overlay, handle that here
  }

  setCameraView(targetPos: THREE.Vector3, cameraPos: THREE.Vector3) {
    this.threeService.camera.position.copy(cameraPos);
    this.threeService.controls.target.copy(targetPos);
    this.threeService.controls.update();
  }
}
