/**
 * The ePIC geometry post-processors, registered by `withEpic()` through
 * dynamic imports: both pull three.js.
 */

import { Injectable } from '@angular/core';
import type { GeometryPostProcessContext, GeometryPostProcessor } from '@dexvis/firebird-ng';
import { prettify } from './epic-geometry-prettifier';
import { arrangeEpicDetectors } from './epic-geometry-arranger';

/**
 * Reflective dRICH mirrors under a procedural studio environment
 * (`scene.environment`). Skipped when the user chose fast materials.
 */
@Injectable()
export class EpicGeometryPrettifier implements GeometryPostProcessor {
  async process(context: GeometryPostProcessContext): Promise<void> {
    if (context.fastMaterials) return;
    await prettify(context.geometry, {
      renderer: context.renderer,
      sceneGeometry: context.sceneGeometry,
      scene: context.scene,
      clippingPlanes: context.clippingPlanes,
    });
  }
}

/**
 * Groups the top-level ePIC detectors into Forward, Central (with
 * Calorimeters, Tracking, PID, Magnets, support subgroups) and Backward
 * nodes, which the scene tree shows and the quad view's geometry copy keeps.
 */
@Injectable()
export class EpicDetectorArranger implements GeometryPostProcessor {
  process(context: GeometryPostProcessContext): void {
    arrangeEpicDetectors(context.sceneGeometry);
  }
}
