import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import {MatCheckbox, MatCheckboxChange} from '@angular/material/checkbox';
import { SceneHelpersService } from '../../services/scene-helpers.service';
import {MatMenu, MatMenuItem, MatMenuTrigger} from '@angular/material/menu';
import {MatIcon} from "@angular/material/icon";
import {MatTooltip} from "@angular/material/tooltip";
import {MatIconButton} from "@angular/material/button";

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
    MatTooltip,
    MatIconButton,
  ]
})
export class ViewOptionsComponent implements OnInit, OnDestroy {
  @ViewChild(MatMenuTrigger) trigger!: MatMenuTrigger;

  showCartesianGrid = false;
  showAxisChecked = true;

  constructor(
    private sceneHelpers: SceneHelpersService
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  setAxis(change: MatCheckboxChange) {
    this.showAxisChecked = change.checked;
    this.sceneHelpers.setShowAxis(change.checked);
  }

  setEtaPhiGrid(change: MatCheckboxChange) {
    this.sceneHelpers.setShowEtaPhiGrid(change.checked);
  }

  setCartesianGrid(change: MatCheckboxChange) {
    this.showCartesianGrid = change.checked;
    this.sceneHelpers.setShowCartesianGrid(this.showCartesianGrid);
  }

  showLabels(change: MatCheckboxChange) {
    this.sceneHelpers.showLabels(change.checked);
  }
}
