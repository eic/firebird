import { Component } from '@angular/core';
import { TrackPainterConfig } from '../track-painter-config';
import { ConfiguratorComponent } from './configurator.component';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-track-configurator',
  standalone: true,
  imports: [
    NgIf,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatCheckboxModule
  ],
  template: `
    <mat-form-field>
      <mat-label>Coloring</mat-label>
      <mat-select [(ngModel)]="config.coloringMode" (ngModelChange)="notifyChanges()">
        <mat-option value="PID">By Particle ID</mat-option>
        <mat-option value="Momentum">By Momentum</mat-option>
        <mat-option value="Color">Single Color</mat-option>
      </mat-select>
    </mat-form-field>

    <mat-form-field *ngIf="config.coloringMode === 'Color'">
      <mat-label>Color</mat-label>
      <input matInput type="color" [(ngModel)]="config.color" (ngModelChange)="notifyChanges()">
    </mat-form-field>

    <mat-form-field>
      <mat-label>Line Width</mat-label>
      <input matInput type="number" [(ngModel)]="config.lineWidth"
             min="1" max="10" step="0.5" (ngModelChange)="notifyChanges()">
    </mat-form-field>

    <mat-checkbox [(ngModel)]="config.showSteps" (ngModelChange)="notifyChanges()">
      Show Steps
    </mat-checkbox>
  `
})
export class TrackConfiguratorComponent extends ConfiguratorComponent<TrackPainterConfig> {}
