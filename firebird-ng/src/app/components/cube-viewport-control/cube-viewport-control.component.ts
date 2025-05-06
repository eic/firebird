// cube-viewport-control.component.ts
import { Component, ElementRef, OnInit, OnDestroy, NgZone } from '@angular/core';
import { GizmoOptions, ViewportGizmo } from 'three-viewport-gizmo';
import { ThreeService } from '../../services/three.service';
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
export class CubeViewportControlComponent implements OnInit, OnDestroy {
  // References to externally provided objects
  public camera!: PerspectiveCamera | OrthographicCamera;
  public scene!: Scene;
  public renderer!: WebGLRenderer;

  // The ViewportGizmo instance
  public gizmo!: ViewportGizmo;

  private lastCamera!: PerspectiveCamera | OrthographicCamera;
  private animationFrameId: number | null = null;

  constructor(
    private elRef: ElementRef,
    private threeService: ThreeService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    // We do NOT call initThreeJS() here.
    // The external scene/camera/renderer will be provided from outside.
  }

  ngOnDestroy(): void {
    // Clean up animation frame on component destruction
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // Clean up any event listeners
    this.threeService.controls.removeEventListener('change', this.handleControlsChange);

    // Dispose of the gizmo if it exists
    if (this.gizmo) {
      this.gizmo.dispose();
    }
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
    this.lastCamera = camera;

    const container = this.elRef.nativeElement.querySelector('.three-container');
    const gizmoConfig: GizmoOptions = {
      container: container,
      size: 90,
      type: 'cube',
      offset: { top: 85 },
      background: { color: 0x444444, hover: { color: 0x444444 } },
      corners: {
        color: 0x333333,
        hover: { color: 0x4bac84 },
      },
      front: { label: "Right" },   // Original left face
      left: { label: "Front" },    // Original back face
      back: { label: "Left" },     // Original right face
      right: { label: "Back" }     // Original front face
    };

    // Create gizmo with custom config (autoPlace = false)
    this.gizmo = new ViewportGizmo(this.camera, this.renderer, gizmoConfig);

    // Bind the method to maintain 'this' context
    this.handleControlsChange = this.handleControlsChange.bind(this);

    // Listen for any changes to OrbitControls
    this.threeService.controls.addEventListener('change', this.handleControlsChange);

    // Start continuous update loop for the gizmo
    this.startGizmoUpdateLoop();
  }

  private handleControlsChange = (): void => {
    this.updateGizmo();
  }

  // Update the gizmo when controls change
  private updateGizmo(): void {
    if (!this.gizmo) return;

    // Check if camera reference has changed
    const current = this.threeService.camera;
    if (current && current !== this.lastCamera) {
      this.lastCamera = current;
      this.camera = current;
      this.gizmo.camera = current;
    }

    // Always update the gizmo to match camera orientation
    this.gizmo.cameraUpdate();
  }

  // Start a continuous update loop to keep the gizmo in sync with camera
  private startGizmoUpdateLoop(): void {
    // Run the update loop outside Angular to avoid triggering unnecessary
    // change detection cycles, which could degrade performance during
    // high-frequency updates like animation loops.
    this.ngZone.runOutsideAngular(() => {
      const animate = () => {
        this.updateGizmo();
        this.animationFrameId = requestAnimationFrame(animate);
      };
      this.animationFrameId = requestAnimationFrame(animate);
    });
  }
}
