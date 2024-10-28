import { Component } from '@angular/core';
import {EventDisplayService} from "phoenix-ui-components";
import {MenuToggleComponent} from "../menu-toggle/menu-toggle.component";
import {MatTooltip} from "@angular/material/tooltip";


@Component({
  selector: 'app-custom-main-view-toggle',
  templateUrl: './main-view-toggle.component.html',
  styleUrls: ['./main-view-toggle.component.scss'],
  imports: [
    MenuToggleComponent,
    MatTooltip
  ],
  standalone: true
})
export class MainViewToggleComponent {
  orthographicView: boolean = false;

  constructor(private eventDisplay: EventDisplayService) {}

  switchMainView() {
    this.orthographicView = !this.orthographicView;
    this.eventDisplay
      .getUIManager()
      .toggleOrthographicView(this.orthographicView);
  }
}
