/**
 * Picking helpers behind ThreeService's pointer handling: the clip test,
 * the visibility-aware raycast, the click gesture test and the picking BVH
 * builder. They hold no Angular or renderer state, so specs can pin them.
 */

import { BufferGeometry, Intersection, Mesh, Object3D, Plane, Raycaster, Vector3 } from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

/** The clip settings of one `ClippingGroup` (or anything shaped like it). */
export interface ClipGroupLike {
  enabled: boolean;
  clipIntersection: boolean;
  clippingPlanes: readonly Plane[];
}

/**
 * The world-space planes that clip a point, split by how they combine. Built
 * the way three's ClippingContext accumulates a chain of nested clipping
 * groups: every enabled group adds its planes to one of the two sets.
 */
export interface ClipPlaneSets {
  /** A point is clipped when it lies behind ANY of these planes. */
  union: Plane[];
  /** A point is clipped when it lies behind ALL of these planes (ignored when empty). */
  intersection: Plane[];
}

const Z_AXIS = new Vector3(0, 0, 1);

/**
 * Points the two wedge planes at a pie slice around the beam (Z) axis:
 * plane A at `startAngleDeg`, plane B at `startAngleDeg + openingAngleDeg`,
 * both through the axis. Returns the clipping mode the slice needs:
 * intersection (true) below 180 degrees, where only the region behind BOTH
 * planes is removed, and union (false) from 180 degrees on.
 */
export function setWedgePlanes(planeA: Plane, planeB: Plane, startAngleDeg: number, openingAngleDeg: number): boolean {
  const start = (startAngleDeg * Math.PI) / 180;
  const opening = (openingAngleDeg * Math.PI) / 180;
  planeA.normal.set(0, -1, 0).applyAxisAngle(Z_AXIS, start);
  planeA.constant = 0;
  planeB.normal.set(0, 1, 0).applyAxisAngle(Z_AXIS, start + opening);
  planeB.constant = 0;
  return openingAngleDeg < 180;
}

/** Collects the plane sets of a chain of nested clipping groups, outermost first. */
export function clipPlaneSetsOf(chain: readonly ClipGroupLike[]): ClipPlaneSets {
  const sets: ClipPlaneSets = { union: [], intersection: [] };
  for (const group of chain) {
    if (!group.enabled || group.clippingPlanes.length === 0) continue;
    (group.clipIntersection ? sets.intersection : sets.union).push(...group.clippingPlanes);
  }
  return sets;
}

/**
 * True when the renderer discards a fragment at `point`. Mirrors three's
 * clipping shader: "behind" a plane means `plane.distanceToPoint(p) < 0`;
 * union planes clip on any, intersection planes only on all.
 */
export function isPointClipped(point: Vector3, planes: ClipPlaneSets): boolean {
  for (const plane of planes.union) {
    if (plane.distanceToPoint(point) < 0) return true;
  }
  if (planes.intersection.length === 0) return false;
  for (const plane of planes.intersection) {
    if (plane.distanceToPoint(point) >= 0) return false;
  }
  return true;
}

/**
 * Raycasts the given subtrees like `Raycaster.intersectObjects(roots, true)`,
 * but skips every object with an invisible ancestor (three's raycaster
 * ignores `visible`, so a hidden piece would block the visible objects
 * behind it). A root that is itself invisible yields no hits.
 */
export function intersectVisible(raycaster: Raycaster, roots: readonly Object3D[]): Intersection[] {
  const hits: Intersection[] = [];
  const visit = (object: Object3D): void => {
    if (!object.visible) return;
    let propagate = true;
    if (object.layers.test(raycaster.layers)) {
      // Object3D.raycast may return false to stop descending, as in three.
      propagate = (object.raycast(raycaster, hits) as unknown) !== false;
    }
    if (!propagate) return;
    for (const child of object.children) visit(child);
  };
  for (const root of roots) visit(root);
  hits.sort((a, b) => a.distance - b.distance);
  return hits;
}

/** Screen position of a pointer event, in CSS pixels. */
export interface PointerPosition {
  clientX: number;
  clientY: number;
}

/** Pointer travel, in CSS pixels, below which a press and release count as a click. */
export const CLICK_MAX_TRAVEL_PX = 5;

/**
 * True when a press and release form a click rather than a drag (an orbit or
 * pan starts with a press too, and must not select).
 */
export function isClickGesture(down: PointerPosition, up: PointerPosition, maxTravelPx = CLICK_MAX_TRAVEL_PX): boolean {
  return Math.hypot(up.clientX - down.clientX, up.clientY - down.clientY) <= maxTravelPx;
}

/**
 * True for meshes whose triangles a MeshBVH can accelerate. Instanced,
 * batched and skinned meshes place triangles through per-instance or
 * per-bone transforms the BVH does not see; fat lines (Line2,
 * LineSegments2) are meshes of instanced quads with their own raycast.
 */
export function isBvhCandidate(object: Object3D): object is Mesh {
  const flags = object as unknown as Record<string, unknown>;
  if (flags['isMesh'] !== true) return false;
  if (flags['isInstancedMesh'] || flags['isBatchedMesh'] || flags['isSkinnedMesh'] || flags['isLineSegments2']) {
    return false;
  }
  const geometry = (object as Mesh).geometry as BufferGeometry | undefined;
  return !!geometry?.attributes?.['position'];
}

/** The BVH candidates of a subtree, in traversal order. */
export function collectBvhCandidates(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse(object => {
    if (isBvhCandidate(object)) meshes.push(object);
  });
  return meshes;
}

/**
 * Routes a subtree's candidate meshes through three-mesh-bvh's raycast.
 * Per mesh, never on `Mesh.prototype`: other meshes in the host app keep
 * three's own raycast. A mesh without a BVH yet falls back to three's
 * raycast inside `acceleratedRaycast`, so this is safe before the build.
 */
export function useAcceleratedRaycast(root: Object3D): void {
  root.traverse(object => {
    if (isBvhCandidate(object)) object.raycast = acceleratedRaycast;
  });
}

/**
 * Builds the picking BVH of one mesh's geometry, once per geometry (copies
 * that share the geometry share the BVH). Indirect mode leaves the
 * geometry's index buffer untouched, so building never changes what or in
 * which order the GPU draws. Returns false when the geometry already had one.
 */
export function buildPickingBvh(mesh: Mesh): boolean {
  const geometry = mesh.geometry as BufferGeometry & { boundsTree?: MeshBVH };
  mesh.raycast = acceleratedRaycast;
  if (geometry.boundsTree) return false;
  geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
  return true;
}
