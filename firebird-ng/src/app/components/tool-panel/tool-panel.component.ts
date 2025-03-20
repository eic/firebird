import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { ViewOptionsComponent } from '../view-options/view-options.component';
import { ThreeService } from '../../services/three.service';

@Component({
    selector: 'app-tool-panel',
    imports: [
        NgIf,
        MatIcon,
        ViewOptionsComponent
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
    const camera = this.threeService.camera;
    // Basic logic: move camera closer/farther from controls.target
    const newPos = camera.position.clone().sub(controls.target).multiplyScalar(factor).add(controls.target);
    camera.position.copy(newPos);
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
