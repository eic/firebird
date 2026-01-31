import {
  Component,
  ViewChild,
  TemplateRef,
  ElementRef,
  ViewContainerRef,
} from '@angular/core';
import * as THREE from 'three';

import { ThreeService } from '../../services/three.service';
import { MatIconButton } from "@angular/material/button";
import { MatDialog, MatDialogClose, MatDialogRef } from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { MatMenuItem } from "@angular/material/menu";
import { MatSlideToggle } from "@angular/material/slide-toggle";
import { FormsModule } from "@angular/forms";

import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

@Component({
  selector: 'app-scene-export',
  templateUrl: './scene-export.html',
  styleUrls: ['./scene-export.scss'],
  imports: [
    MatIconButton,
    MatIcon,
    MatDialogClose,
    MatTooltip,
    MatMenuItem,
    MatSlideToggle,
    FormsModule,
  ]
})
export class SceneExportComponent {
  @ViewChild('openBtn', { read: ElementRef }) openBtn!: ElementRef;
  @ViewChild('dialogTemplate') dialogTemplate!: TemplateRef<any>;
  dialogRef: MatDialogRef<any> | null = null;

  isExporting = false;
  useBinaryFormat = true; // GLB by default

  constructor(
    private threeService: ThreeService,
    private dialog: MatDialog,
    private viewContainerRef: ViewContainerRef,
  ) {}

  openDialog(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
      return;
    }

    const rect = this.openBtn.nativeElement.getBoundingClientRect();
    const dialogWidth = 280;

    const left = Math.max(rect.right - dialogWidth, 8);
    const top = rect.bottom + 12;

    this.dialogRef = this.dialog.open(this.dialogTemplate, {
      position: {
        top: `${top}px`,
        left: `${left}px`
      },
      hasBackdrop: false,
      panelClass: 'custom-position-dialog',
      autoFocus: false,
      viewContainerRef: this.viewContainerRef
    });

    this.dialogRef.afterClosed().subscribe(() => {
      this.dialogRef = null;
    });
  }

  exportFullScene(): void {
    const ext = this.useBinaryFormat ? 'glb' : 'gltf';
    this.exportToGLTF(this.threeService.scene, `firebird-scene.${ext}`);
  }

  exportGeometryOnly(): void {
    const ext = this.useBinaryFormat ? 'glb' : 'gltf';
    this.exportToGLTF(this.threeService.sceneGeometry, `firebird-geometry.${ext}`);
  }

  private exportToGLTF(object: THREE.Object3D, filename: string): void {
    if (this.isExporting) return;

    this.isExporting = true;
    const exporter = new GLTFExporter();

    exporter.parse(
      object,
      (result) => {
        this.downloadFile(result, filename);
        this.isExporting = false;
        if (this.dialogRef) {
          this.dialogRef.close();
        }
      },
      (error) => {
        console.error('Error exporting scene:', error);
        this.isExporting = false;
      },
      { binary: this.useBinaryFormat }
    );
  }

  private downloadFile(data: ArrayBuffer | object, filename: string): void {
    let blob: Blob;

    if (data instanceof ArrayBuffer) {
      blob = new Blob([data], { type: 'application/octet-stream' });
    } else {
      const jsonString = JSON.stringify(data);
      blob = new Blob([jsonString], { type: 'application/json' });
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }
}
