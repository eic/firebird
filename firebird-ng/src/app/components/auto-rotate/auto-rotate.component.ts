import { Component } from '@angular/core';
import {EventDisplayService} from "phoenix-ui-components";
import {MenuToggleComponent} from "../menu-toggle/menu-toggle.component";

@Component({
    selector: 'app-custom-auto-rotate',
    templateUrl: './auto-rotate.component.html',
    styleUrls: ['./auto-rotate.component.scss'],
    imports: [
        MenuToggleComponent
    ]
})
export class AutoRotateComponent {
  autoRotate = false;

  constructor(private eventDisplay: EventDisplayService) {}

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    this.eventDisplay.getUIManager().setAutoRotate(this.autoRotate);
  }
}
