import {Component, Input} from '@angular/core';
import {NgIf} from "@angular/common";
import {MatIcon} from "@angular/material/icon";
import { EventDisplayService } from 'phoenix-ui-components';

@Component({
  selector: 'app-tool-panel',
  standalone: true,
  imports: [
    NgIf,
    MatIcon
  ],
  templateUrl: './tool-panel.component.html',
  styleUrl: './tool-panel.component.scss'
})
export class ToolPanelComponent {
  isCollapsed = false;

  /** Factor to zoom by. */
  private zoomFactor: number = 1.1;
  /** Timeout for clearing mouse hold. */
  private zoomTimeout: any;
  /** The speed and time of zoom. */
  private zoomTime: number = 100;

  constructor(private eventDisplay: EventDisplayService) {}

  /**
   * Zoom all the cameras by a specific zoom factor.
   * The factor may either be greater (zoom in) or smaller (zoom out) than 1.
   * @param zoomFactor The factor to zoom by.
   */
  zoomTo(zoomFactor: number) {
    this.zoomTime =
      this.zoomTime > 30 ? Math.floor(this.zoomTime / 1.1) : this.zoomTime;

    this.eventDisplay.zoomTo(zoomFactor, this.zoomTime);

    this.zoomTimeout = setTimeout(() => {
      this.zoomTo(zoomFactor);
    }, this.zoomTime);
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



}
