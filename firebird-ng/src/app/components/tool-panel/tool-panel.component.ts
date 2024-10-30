import {Component, Input} from '@angular/core';
import {NgIf} from "@angular/common";
import {MatIcon} from "@angular/material/icon";
import {EventDisplayService, PhoenixUIModule} from 'phoenix-ui-components';
import {PhoenixThreeFacade} from "../../utils/phoenix-three-facade";
import {ViewOptionsComponent} from "../view-options/view-options.component";

@Component({
  selector: 'app-tool-panel',
  standalone: true,
  imports: [
    NgIf,
    MatIcon,
    PhoenixUIModule,
    ViewOptionsComponent
  ],
  templateUrl: './tool-panel.component.html',
  styleUrl: './tool-panel.component.scss'
})
export class ToolPanelComponent {
  isCollapsed = false;

  private threeFacade: PhoenixThreeFacade;
  /** Factor to zoom by. */
  private zoomFactor: number = 1.1;
  /** Timeout for clearing mouse hold. */
  private zoomTimeout: any;
  /** The speed and time of zoom. */
  private zoomTime: number = 100;
  private orthographicView: boolean = false;

  constructor(
    private eventDisplay: EventDisplayService)
  {
    this.threeFacade = new PhoenixThreeFacade(this.eventDisplay);
  }

  /**
   * Zoom all the cameras by a specific zoom factor.
   * The factor may either be greater (zoom in) or smaller (zoom out) than 1.
   * @param factor
   */
  zoomTo(factor: number) {
    let orbitControls = this.threeFacade.activeOrbitControls;
    let camera = this.threeFacade.mainCamera;
    orbitControls.object.position.subVectors(camera.position, orbitControls.target).multiplyScalar(factor).add(orbitControls.target);
    orbitControls.update();
  }

  onLeftClick(event: MouseEvent, action: string) {
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
    this.zoomTime = 100;
    clearTimeout(this.zoomTimeout);
  }

  togglePanel() {
    this.isCollapsed = !this.isCollapsed;
  }

  switchMainView() {
    this.orthographicView = !this.orthographicView;
    this.eventDisplay
      .getUIManager()
      .toggleOrthographicView(this.orthographicView);
  }



}
