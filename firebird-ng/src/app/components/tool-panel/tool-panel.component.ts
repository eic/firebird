import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { ViewOptionsComponent } from '../view-options/view-options.component';
import { ThreeService } from '../../services/three.service';
import {MatIconButton} from "@angular/material/button";
import {MatTooltip} from "@angular/material/tooltip";
import * as THREE from 'three';


@Component({
    selector: 'app-tool-panel',
  imports: [
    NgIf,
    MatIcon,
    ViewOptionsComponent,
    MatIconButton,
    MatTooltip,

  ],
    templateUrl: './tool-panel.component.html',
    styleUrls: ['./tool-panel.component.scss']
})
export class ToolPanelComponent {
  isCollapsed = false;

  /** Factor to zoom by. */
  private zoomFactor = 1.1;
  /** Whether camera is orthographic or perspective. */
  private orthographicView = false;

  constructor(
    private threeService: ThreeService // no more EventDisplayService
  ) {}

  /**
   * Zoom in or out around the orbit controls target.
   * Use OrbitControls or direct camera logic from threeService.
   */
  private zoomTo(factor: number): void {
    const controls = this.threeService.controls;
    const cam = this.threeService.camera as THREE.Camera;

    // Ensure matrices are up to date
    cam.updateMatrixWorld(true);

    const target = controls.target;

    if ((cam as any).isOrthographicCamera) {
      const ortho = cam as THREE.OrthographicCamera;
      const newZoom = ortho.zoom / Math.max(1e-6, factor);

      ortho.zoom = THREE.MathUtils.clamp(newZoom, 0.01, 1e5);
      ortho.updateProjectionMatrix();

    } else if ((cam as any).isPerspectiveCamera) {
      const persp = cam as THREE.PerspectiveCamera;

      const dir = new THREE.Vector3().subVectors(persp.position, target).normalize();
      const dist = persp.position.distanceTo(target);

      let newDist = dist * factor;

      const minD = (controls as any).minDistance ?? 0.001;
      const maxD = (controls as any).maxDistance ?? Infinity;
      newDist = THREE.MathUtils.clamp(newDist, minD, maxD);

      const newPos = new THREE.Vector3().copy(target).addScaledVector(dir, newDist);
      persp.position.copy(newPos);

      persp.lookAt(target);
    }

    controls.update();
  }

  onLeftClick(event: MouseEvent, action: string) {
    // Only respond to left-button
    if (event.button === 0) {
      if (action === 'zoomIn') {
        this.zoomIn();
      } else if (action === 'zoomOut') {
        this.zoomOut();
      }
    }
  }

  zoomIn() {
    this.zoomTo(1 / this.zoomFactor);
  }

  zoomOut() {
    this.zoomTo(this.zoomFactor);
  }

  clearZoom() {
    // If you had logic for continuous zoom while mouse is held, you can clear it here
  }

  togglePanel() {
    this.isCollapsed = !this.isCollapsed;
  }

  /**
   * Switch between orthographic and perspective camera.
   * You can define a method in ThreeService to do the actual swap or toggling.
   */
  switchMainView() {
    this.orthographicView = !this.orthographicView;
    this.threeService.toggleOrthographicView(this.orthographicView);
  }
}
