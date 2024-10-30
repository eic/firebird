import { Component } from '@angular/core';
import {MatCheckbox, MatCheckboxChange} from '@angular/material/checkbox';
import {EventDisplayService} from "phoenix-ui-components";
import {MatMenu, MatMenuItem, MatMenuTrigger} from "@angular/material/menu";
import {MatSlider, MatSliderThumb} from "@angular/material/slider";
import {MenuToggleComponent} from "../menu-toggle/menu-toggle.component";

@Component({
  selector: 'app-custom-object-clipping',
  templateUrl: './object-clipping.component.html',
  styleUrls: ['./object-clipping.component.scss'],
  imports: [
    MatMenu,
    MatCheckbox,
    MatMenuItem,
    MatSlider,
    MatSliderThumb,
    MenuToggleComponent,
    MatMenuTrigger
  ],
  standalone: true
})
export class ObjectClippingComponent {
  clippingEnabled!: boolean;
  startClippingAngle!: number;
  openingClippingAngle!: number;

  constructor(private eventDisplay: EventDisplayService) {
    const stateManager = this.eventDisplay.getStateManager();
    stateManager.clippingEnabled.onUpdate(
      (clippingValue) => (this.clippingEnabled = clippingValue),
    );
    stateManager.startClippingAngle.onUpdate(
      (value) => (this.startClippingAngle = value),
    );
    stateManager.openingClippingAngle.onUpdate(
      (value) => (this.openingClippingAngle = value),
    );
  }

  changeStartClippingAngle(startingAngle: number) {
    this.eventDisplay.getUIManager().rotateStartAngleClipping(startingAngle);
  }

  changeOpeningClippingAngle(openingAngle: number) {
    this.eventDisplay.getUIManager().rotateOpeningAngleClipping(openingAngle);
  }

  toggleClipping(change: MatCheckboxChange) {
    const value = change.checked;
    this.eventDisplay.getUIManager().setClipping(value);
    this.clippingEnabled = value;
  }
}
