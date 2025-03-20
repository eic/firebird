// cube-viewport-control.component.ts
import { Component, ElementRef, OnInit } from '@angular/core';
import * as THREE from 'three';
import {GizmoOptions, ViewportGizmo} from 'three-viewport-gizmo';
import {
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  WebGLRenderer
} from 'three';

@Component({
  selector: 'app-cube-viewport-control',
  standalone: true,
  templateUrl: './cube-viewport-control.component.html',
})
export class CubeViewportControlComponent implements OnInit {
  // References to externally provided objects
  public camera!: PerspectiveCamera | OrthographicCamera;
  public scene!: Scene;
  public renderer!: WebGLRenderer;

  // The ViewportGizmo instance
  public gizmo!: ViewportGizmo;

  constructor(private elRef: ElementRef) {}

  ngOnInit(): void {
    // We do NOT call initThreeJS() here.
    // The external scene/camera/renderer will be provided from outside.
  }

  /**
   * Called from the parent component (e.g. MainDisplayComponent) to link
   * the same scene/camera/renderer that are used for the main 3D view.
   */
  public initWithExternalScene(
    scene: Scene,
    camera: PerspectiveCamera | OrthographicCamera,
    renderer: WebGLRenderer
  ): void {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    const container = this.elRef.nativeElement.querySelector('.three-container');
    const gizmoConfig:GizmoOptions = {
      container: container,
      size: 90,
      type: 'cube',
      offset: {top: 85},
      background: {color: 0x444444, hover: {color: 0x444444}},
      corners: {
        color: 0x333333,
        hover: {color: 0x4bac84},
      },
       // Define axis configurations (customize these as needed)
    // x: { scale: 5 },       // Original "right" axis (X+)
    // z: { color: 0x00ff00 },       // Original "front" axis (Z+)
    // nx: { color: 0x0000ff },      // Original "left" axis (X-)
    // nz: { color: 0xffff00 },      // Original "back" axis (Z-)
    //     front: {nx},  // Original left (nx) becomes new front
    //     right: z,   // Original front (z) becomes new right
    //     back: x,    // Original right (x) becomes new back
    //     left: nz,   // Original back (nz) becomes new left

      front: { label: "Right" },   // Original left face
      left: { label: "Front" },    // Original back face
      back: { label: "Left" },   // Original right face
      right: { label: "Back" }   // Original front face
    };

    // Create gizmo with custom config (autoPlace = false)
    this.gizmo = new ViewportGizmo(this.camera, this.renderer, gizmoConfig);

    }
}
