/**
 * Camera navigation cube (viewport gizmo), wired as a builtin ThreeExtension.
 *
 * The cube shows the camera orientation and IS a camera control: click a face,
 * edge or corner to animate there, drag to orbit, roll the view with the
 * curved-arrow buttons, or return to the home view. Rendering, axis
 * conventions and the WebGPU handling live in `@dexvis/viewport-gizmo`
 * (dexvis/viewport-gizmo submodule); this file only binds it to Firebird's
 * scene, controls, frame loop, and command bus.
 *
 * Loaded through `withLazyThreeExtension` — the gizmo pulls three.js code and
 * must stay out of the initial bundle.
 */

import { Injectable, inject } from '@angular/core';
import { ViewportGizmo } from '@dexvis/viewport-gizmo';
import type { OrthographicCamera, PerspectiveCamera } from 'three';

import { ThreeService } from '../services/three.service';
import { CommandBusService } from './command-bus.service';
import type { SceneContext, ThreeExtension } from './three-extension';

@Injectable()
export class ViewportGizmoExtension implements ThreeExtension {
  private threeService = inject(ThreeService);
  private commandBus = inject(CommandBusService);

  private gizmo?: ViewportGizmo;
  private lastCamera?: PerspectiveCamera | OrthographicCamera;
  private resizeObserver?: ResizeObserver;

  onSceneInit(ctx: SceneContext): void {
    // Overlay positioning is relative to the canvas parent (#eventDisplay),
    // which starts right below the toolbar.
    const container = ctx.canvas.parentElement ?? undefined;

    this.gizmo = new ViewportGizmo(ctx.camera, ctx.renderer, {
      container,
      size: 90,
      placement: 'top-right',
      offset: { top: 10, right: 20 },
      background: { color: 0x444444, hover: { color: 0x444444 } },
      corners: { color: 0x333333, hover: { color: 0x4bac84 } },
      // HENP axis convention: beam along Z, Y up, X toward the accelerator
      // center. The front view has Y up and Z pointing right on the screen
      // (camera on -X, +X goes into the screen); the top/bottom views keep Z
      // pointing right, which puts X toward the top of the screen when viewed
      // from above (poleUp).
      poleUp: { top: [1, 0, 0], bottom: [-1, 0, 0] },
      nx: { label: 'Front' },
      x: { label: 'Back' },
      z: { label: 'Right' },
      nz: { label: 'Left' },
      y: { label: 'Top' },
      ny: { label: 'Bottom' },
    });

    this.gizmo.attachControls(this.threeService.controls);
    this.lastCamera = ctx.camera;

    // Home goes through the command bus like any other camera move, so the
    // same view is reachable from deep links and batch: camera-preset:home.
    this.gizmo.addEventListener('home', () => {
      void this.commandBus.dispatch({ type: 'camera-preset', name: 'home', source: 'ui' });
    });

    // Frame callbacks run after the main scene render — the gizmo overlay
    // must draw on top of it.
    this.threeService.addFrameCallback(this.renderGizmo);

    // Recompute the gizmo viewport when the canvas area changes (pane
    // toggles, window resize) — orbiting is not the only thing that moves it.
    this.resizeObserver = new ResizeObserver(() => this.gizmo?.update(false));
    this.resizeObserver.observe(container ?? ctx.canvas);
  }

  onDispose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    if (this.gizmo) {
      this.threeService.removeFrameCallback(this.renderGizmo);
      this.gizmo.dispose();
      this.gizmo = undefined;
    }
  }

  private renderGizmo = (): void => {
    const gizmo = this.gizmo;
    if (!gizmo) return;

    // Follow perspective/orthographic camera switches
    const camera = this.threeService.camera;
    if (camera !== this.lastCamera) {
      this.lastCamera = camera;
      gizmo.camera = camera;
      gizmo.update(false);
    }

    gizmo.cameraUpdate();
    gizmo.render();
  };
}
