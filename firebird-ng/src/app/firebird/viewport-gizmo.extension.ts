/**
 * Camera navigation cube (viewport gizmo), wired as a builtin ThreeExtension.
 *
 * The cube shows the camera orientation and IS a camera control: click a face,
 * edge or corner to animate there, drag to orbit, roll the view with the
 * curved-arrow buttons, or return to the home view. Rendering, axis
 * conventions and the WebGPU handling live in `@dexvis/viewport-gizmo`
 * (dexvis/viewport-gizmo submodule); this file binds it to Firebird's main
 * RenderView as a view overlay: the overlay renders after the view's scene
 * render and follows the view's camera, container and resizes. An extension
 * that wants its own overlay uses the same seam (`view.addOverlay`).
 *
 * Loaded through `withLazyThreeExtension` — the gizmo pulls three.js code and
 * must stay out of the initial bundle.
 */

import { Injectable, inject } from '@angular/core';
import { ViewportGizmo } from '@dexvis/viewport-gizmo';
import type { OrthographicCamera, PerspectiveCamera } from 'three';

import type { RenderView, ViewOverlay } from '../services/render-view';
import { CommandBusService } from './command-bus.service';
import type { SceneContext, ThreeExtension } from './three-extension';

@Injectable()
export class ViewportGizmoExtension implements ThreeExtension {
  private commandBus = inject(CommandBusService);

  private gizmo?: ViewportGizmo;
  private view?: RenderView;
  private overlay?: ViewOverlay;
  private lastCamera?: PerspectiveCamera | OrthographicCamera;

  onSceneInit(ctx: SceneContext): void {
    const view = ctx.mainView;
    this.view = view;

    this.gizmo = new ViewportGizmo(view.camera, ctx.renderer, {
      // Overlay positioning is relative to the view container.
      container: view.container,
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

    this.gizmo.attachControls(view.controls);
    this.lastCamera = view.camera;

    // Home goes through the command bus like any other camera move, so the
    // same view is reachable from deep links and batch: camera-preset:home.
    this.gizmo.addEventListener('home', () => {
      void this.commandBus.dispatch({ type: 'camera-preset', name: 'home', source: 'ui' });
    });

    // Render-on-demand chain for cube interactions: clicks and view
    // transitions emit 'change' per step (the transition advances inside the
    // overlay render), so each step schedules the next frame until the
    // animation settles.
    this.gizmo.addEventListener('start', () => ctx.invalidate());
    this.gizmo.addEventListener('change', () => ctx.invalidate());

    // View overlay: renders after the view's scene render (the cube must
    // draw on top) and re-anchors when the view is resized (pane toggles,
    // window resizes — the view calls onViewResize from updateViewport).
    this.overlay = {
      render: () => this.renderGizmo(),
      onViewResize: () => this.gizmo?.update(false),
      // The cube follows the view across page layouts (single display,
      // quad view): its overlay div moves into the view's new container.
      onViewContainerChange: (changed) => this.gizmo?.setContainer(changed.container),
      dispose: () => this.disposeGizmo(),
    };
    view.addOverlay(this.overlay);
  }

  onDispose(): void {
    if (this.view && this.overlay) {
      this.view.removeOverlay(this.overlay);
    }
    this.disposeGizmo();
    this.view = undefined;
    this.overlay = undefined;
  }

  private disposeGizmo(): void {
    this.gizmo?.dispose();
    this.gizmo = undefined;
  }

  private renderGizmo(): void {
    const gizmo = this.gizmo;
    const view = this.view;
    if (!gizmo || !view) return;

    // Follow perspective/orthographic camera switches
    const camera = view.camera;
    if (camera !== this.lastCamera) {
      this.lastCamera = camera;
      gizmo.camera = camera;
      gizmo.update(false);
    }

    gizmo.cameraUpdate();
    gizmo.render();
  }
}
