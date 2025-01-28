import { Component } from '@angular/core';
import {MenuToggleComponent} from "../menu-toggle/menu-toggle.component";
import {ThreeService} from "../../services/three.service";

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

  constructor(private threeService: ThreeService) {}

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    // TODO this.threeService.getUIManager().setAutoRotate(this.autoRotate);
  }
}
