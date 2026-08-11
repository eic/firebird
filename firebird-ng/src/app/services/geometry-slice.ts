/**
 * ClippedGeometrySlice — a second, independently clipped copy of the detector
 * geometry, used by projection views (top / side / front) that need a
 * different cut than the main 3D view.
 *
 * Why a copy: the renderer caches an object's shader state by its clipping
 * plane COUNTS, and all views of one canvas share render objects. If the same
 * mesh had 2 wedge planes in the 3D view but 1 axis plane in a projection
 * view, its cached state would flip every view render — a full
 * dispose/rebuild of every object, every frame. Giving each clipping
 * STRUCTURE its own Object3D copy keeps every cached state valid forever.
 * Only the Object3D spine is copied; BufferGeometry, materials and textures
 * are shared references, so GPU memory does not duplicate.
 *
 * Why ONE slice serves all projection views: plane VALUES are re-projected
 * on every render call, so views that share a structure (one axis plane
 * each) share this slice and just write their own plane value before their
 * render (see RenderView.clipPlane). Per-view plane values on a shared
 * group are free; per-view plane counts are not.
 *
 * Layer routing: the original geometry moves to GEOMETRY_MAIN_LAYER (seen by
 * the main/3D camera), the slice spine lives on GEOMETRY_SLICE_LAYER (seen
 * by projection cameras). Event data, helpers and lights stay on layer 0,
 * which every camera has enabled — they are shared, never copied.
 */

import { Object3D, Plane, Vector3 } from 'three';
import { ClippingGroup } from 'three/webgpu';

/** Original detector geometry: rendered by the main/3D view only. */
export const GEOMETRY_MAIN_LAYER = 1;
/** Slice spine: rendered by projection views only. */
export const GEOMETRY_SLICE_LAYER = 2;
/**
 * Event data (painter-created objects under sceneEvent). Every camera has
 * this layer enabled; it exists so a "tracks on top" view can render the
 * event subtree in a second pass over a cleared depth buffer. The LIGHTS
 * also enable this layer — both passes must collect the identical light
 * set, because light-set membership is part of the render-object cache key
 * and a differing set would rebuild every shared render object each frame.
 */
export const EVENT_DATA_LAYER = 3;

export class ClippedGeometrySlice {
  /** The clipping group holding the spine copy. Added to the scene by ThreeService. */
  readonly group: ClippingGroup;

  /**
   * The one clip plane, in world space. Views sharing this slice write their
   * own plane value here right before their render call (plane values are
   * re-projected per render, so sequential views each get their own cut).
   */
  readonly plane = new Plane(new Vector3(0, -1, 0), 0);

  /** The geometry root the spine was built from (for layer restore on dispose). */
  private source: Object3D | null = null;

  constructor() {
    this.group = new ClippingGroup();
    this.group.name = 'GeometrySlice';
    // Intersection mode with a single plane clips exactly like union mode,
    // but gives this group the (1 intersection : 0 union) plane-count shape —
    // one the main clipping chain can never produce (the wedge is always 2
    // planes, Z clipping is always union). Distinct count shapes between
    // clipping groups are load-bearing: the renderer caches built shader
    // states by plane counts only, so two groups with the same shape would
    // share one shader bound to ONE group's plane array, and the other group
    // would silently clip with the wrong planes.
    this.group.clipIntersection = true;
    this.group.clippingPlanes = [this.plane];
    this.group.enabled = true;
  }

  /**
   * (Re)builds the spine from the current content of `sourceGeometry` and
   * routes layers: originals to GEOMETRY_MAIN_LAYER, spine copies to
   * GEOMETRY_SLICE_LAYER. Call again after a geometry load replaces the
   * source content. Copies share geometry/material with the originals, so a
   * later visibility or material edit on originals does NOT propagate to the
   * spine — rebuild to resync.
   */
  rebuild(sourceGeometry: Object3D): void {
    this.source = sourceGeometry;
    this.group.clear();

    // Mirror the source root transform (geometry loading applies a cm→mm
    // scale on the geometry root; the spine must sit in the same frame).
    this.group.position.copy(sourceGeometry.position);
    this.group.quaternion.copy(sourceGeometry.quaternion);
    this.group.scale.copy(sourceGeometry.scale);

    for (const child of sourceGeometry.children) {
      this.group.add(child.clone(true));
    }

    this.group.traverse(node => {
      if (node !== this.group) {
        node.layers.set(GEOMETRY_SLICE_LAYER);
        // Spine transforms are frozen copies; skip per-frame matrix math.
        node.matrixAutoUpdate = false;
      }
    });
    sourceGeometry.traverse(node => {
      if (node !== sourceGeometry) node.layers.set(GEOMETRY_MAIN_LAYER);
    });

    this.group.updateMatrixWorld(true);
  }

  /**
   * Returns the original geometry to layer 0 (single-view pages render it
   * with any camera again) and drops the spine. The caller removes
   * `group` from the scene.
   */
  dispose(): void {
    this.source?.traverse(node => {
      if (node !== this.source) node.layers.set(0);
    });
    this.source = null;
    this.group.clear();
  }
}
