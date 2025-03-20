import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import {MatCheckbox, MatCheckboxChange} from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { CartesianGridConfigComponent } from './cartesian-grid-config/cartesian-grid-config.component';
import { SceneHelpersService } from '../../services/scene-helpers.service';
import { Vector3 } from 'three';
import { Subscription } from 'rxjs';
import {MatMenu, MatMenuItem, MatMenuTrigger} from '@angular/material/menu';
import {MatIcon} from "@angular/material/icon";
import {NgForOf, NgIf} from "@angular/common";

@Component({
    selector: 'app-custom-view-options',
    templateUrl: './view-options.component.html',
    styleUrls: ['./view-options.component.scss'],
  imports: [
    MatMenu,
    MatCheckbox,
    MatIcon,
    MatMenuItem,
    MatMenuTrigger,
    NgForOf,
    NgIf,
    // the relevant Material modules, e.g. MatMenu, MatCheckbox, etc.
  ]
})
export class ViewOptionsComponent implements OnInit, OnDestroy {
  @ViewChild(MatMenuTrigger) trigger!: MatMenuTrigger;

  // toggles
  showCartesianGrid = false;
  scale = 3000;

  // If you had "views" for camera preset positions,
  // you can define them yourself. e.g.:
  views = [
    { name: 'Left View', icon: 'left-cube', target: new Vector3(0,0,0), cameraPos: new Vector3(0,0,1200) },
    { name: 'Center View', icon: 'top-cube', target: new Vector3(0,0,0), cameraPos: new Vector3(1200,0,0) },
    // etc...
  ];

  constructor(
    private dialog: MatDialog,
    private sceneHelpers: SceneHelpersService
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  // Example "view" code
  displayView($event: MouseEvent, view: any) {
    $event.stopPropagation();
    // We set the camera:
    this.sceneHelpers.setCameraView(view.target, view.cameraPos);
  }

  // Toggling axis
  setAxis(change: MatCheckboxChange) {
    this.sceneHelpers.setShowAxis(change.checked);
  }

  // Toggling eta-phi
  setEtaPhiGrid(change: MatCheckboxChange) {
    this.sceneHelpers.setShowEtaPhiGrid(change.checked);
  }

  // Toggling cartesian grid
  setCartesianGrid(change: MatCheckboxChange) {
    this.showCartesianGrid = change.checked;
    this.sceneHelpers.setShowCartesianGrid(this.showCartesianGrid, this.scale);
  }

  // Toggling labels
  showLabels(change: MatCheckboxChange) {
    this.sceneHelpers.showLabels(change.checked);
  }

  // Toggling 3D points
  show3DMousePoints(change: MatCheckboxChange) {
    this.sceneHelpers.show3DMousePoints(change.checked);
  }

  // Toggling 3D distance
  toggleShowDistance(change: MatCheckboxChange) {
    this.trigger.closeMenu();
    this.sceneHelpers.show3DDistance(change.checked);
  }

  // Opening the config dialog for cartesian grid
  openCartesianGridConfigDialog() {
    this.dialog.open(CartesianGridConfigComponent, {
      data: {
        gridVisible: this.showCartesianGrid,
        scale: this.scale,
      },
      position: {
        bottom: '5rem',
        left: '3rem',
      },
    });
  }
}
