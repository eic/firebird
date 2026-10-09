import { Component, Inject, OnInit } from '@angular/core';
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogTitle,
  MatDialogContent
} from '@angular/material/dialog';
import { SceneHelpersService } from '../../../services/scene-helpers.service';
import { Vector3 } from 'three';
import {MatCheckbox} from "@angular/material/checkbox";
import {MatMenuItem} from "@angular/material/menu";
import {MatSlider, MatSliderThumb} from "@angular/material/slider";
import {MatButton} from "@angular/material/button";

@Component({
    selector: 'app-cartesian-grid-config',
    templateUrl: './cartesian-grid-config.component.html',
    styleUrls: ['./cartesian-grid-config.component.scss'],
    imports: [
        MatCheckbox,
        MatMenuItem,
        MatSlider,
        MatSliderThumb,
        MatDialogActions,
        MatButton,
        MatDialogTitle,
        MatDialogContent,
        // relevant Angular + Material modules
    ]
})
export class CartesianGridConfigComponent implements OnInit {
  showCartesianGrid!: boolean;
  scale!: number;

  // Example internal config:
  gridConfig = {
    showXY: true,
    showYZ: true,
    showZX: true,
    xDistance: 1000,
    yDistance: 1000,
    zDistance: 1000,
    sparsity: 2,
  };

  // Current "origin" or "cartesianPos" if you want that logic
  cartesianPos = new Vector3();

  constructor(
    @Inject(MAT_DIALOG_DATA)
    public data: { gridVisible: boolean; scale: number },
    private dialogRef: MatDialogRef<CartesianGridConfigComponent>,
    private sceneHelpers: SceneHelpersService
  ) {}

  ngOnInit(): void {
    // init local states from data
    this.showCartesianGrid = this.data.gridVisible;
    this.scale = this.data.scale;
  }

  onClose() {
    this.dialogRef.close();
  }

  onSave(xStr: string, yStr: string, zStr: string) {
    // Shift the grid by new origin
    const xNum = Number(xStr);
    const yNum = Number(yStr);
    const zNum = Number(zStr);

    const shift = new Vector3(
      xNum - this.cartesianPos.x,
      yNum - this.cartesianPos.y,
      zNum - this.cartesianPos.z
    );
    this.sceneHelpers.translateCartesianGrid(shift);
    this.cartesianPos.set(xNum, yNum, zNum);
    // Optionally update the main show/hide
    this.sceneHelpers.setShowCartesianGrid(this.showCartesianGrid, this.scale, this.gridConfig);

    this.dialogRef.close();
  }

  shiftCartesianGridByPointer() {
    // replicate your old “click-based shifting”
    this.sceneHelpers.shiftCartesianGridByPointer();
    this.dialogRef.close();
  }

  // Then for toggling planes or adjusting distances:
  showXYPlanes(value: boolean) {
    this.gridConfig.showXY = value;
    this.applyGridConfig();
  }
  showYZPlanes(value: boolean) {
    this.gridConfig.showYZ = value;
    this.applyGridConfig();
  }
  showZXPlanes(value: boolean) {
    this.gridConfig.showZX = value;
    this.applyGridConfig();
  }

  addXYPlanes(event: Event) {
    const inputVal = Number((event.target as HTMLInputElement).value);
    this.gridConfig.zDistance = inputVal;
    this.applyGridConfig();
  }
  // etc. for XDistance, YDistance, etc.

  applyGridConfig() {
    // Actually update the group in scene
    this.sceneHelpers.setShowCartesianGrid(this.showCartesianGrid, this.scale, this.gridConfig);
  }

  calcPlanes(dist: number) {
    // Some logic to compute how many planes
    return Math.max(
      0,
      1 + 2 * Math.floor((dist * 10) / (this.scale * this.gridConfig.sparsity))
    );
  }
}
