import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Raycaster,
  SphereGeometry,
  Vector3,
} from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';
import {
  buildPickingBvh,
  clipPlaneSetsOf,
  collectBvhCandidates,
  intersectVisible,
  isBvhCandidate,
  isClickGesture,
  isPointClipped,
  setWedgePlanes,
  useAcceleratedRaycast,
} from './picking';

const material = new MeshBasicMaterial();

/** A unit box centered on the Z axis at `z`. */
function boxAt(z: number, name: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
  mesh.position.set(0, 0, z);
  mesh.name = name;
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** A ray from z = 100 looking down -Z through the origin. */
function rayDownZ(): Raycaster {
  return new Raycaster(new Vector3(0, 0, 100), new Vector3(0, 0, -1));
}

describe('clip test (picking matches what the renderer clips)', () => {
  // The wedge as ThreeService builds it: start 90, opening 90 removes the
  // quadrant x < 0, y > 0 (intersection mode: behind BOTH planes).
  function quarterWedge() {
    const a = new Plane();
    const b = new Plane();
    const clipIntersection = setWedgePlanes(a, b, 90, 90);
    return { a, b, clipIntersection };
  }

  it('a wedge under 180 degrees clips only the region behind both planes', () => {
    const { a, b, clipIntersection } = quarterWedge();
    expect(clipIntersection).toBe(true);
    const planes = clipPlaneSetsOf([{ enabled: true, clipIntersection, clippingPlanes: [a, b] }]);

    expect(isPointClipped(new Vector3(-5, 5, 0), planes)).toBe(true);   // removed quadrant
    expect(isPointClipped(new Vector3(5, 5, 0), planes)).toBe(false);   // visible
    expect(isPointClipped(new Vector3(-5, -5, 0), planes)).toBe(false); // visible
    expect(isPointClipped(new Vector3(5, -5, 0), planes)).toBe(false);  // visible
  });

  it('a wedge of 180 degrees or more clips on either plane (union mode)', () => {
    const a = new Plane();
    const b = new Plane();
    const clipIntersection = setWedgePlanes(a, b, 0, 180);
    expect(clipIntersection).toBe(false);
    const planes = clipPlaneSetsOf([{ enabled: true, clipIntersection, clippingPlanes: [a, b] }]);
    // Start 0, opening 180: plane A keeps y <= 0, plane B keeps y <= 0 too.
    expect(isPointClipped(new Vector3(3, 5, 0), planes)).toBe(true);
    expect(isPointClipped(new Vector3(3, -5, 0), planes)).toBe(false);
  });

  it('nested groups combine: the Z plane (union) clips on its own, disabled groups never clip', () => {
    const { a, b, clipIntersection } = quarterWedge();
    const zPlane = new Plane(new Vector3(0, 0, 1), 0); // keeps z >= 0
    const planes = clipPlaneSetsOf([
      { enabled: true, clipIntersection: false, clippingPlanes: [zPlane] },
      { enabled: true, clipIntersection, clippingPlanes: [a, b] },
    ]);
    expect(planes.union).toEqual([zPlane]);
    expect(planes.intersection).toEqual([a, b]);
    expect(isPointClipped(new Vector3(5, 5, -1), planes)).toBe(true);  // behind the Z plane
    expect(isPointClipped(new Vector3(5, 5, 1), planes)).toBe(false);

    const disabled = clipPlaneSetsOf([
      { enabled: false, clipIntersection: false, clippingPlanes: [zPlane] },
      { enabled: false, clipIntersection, clippingPlanes: [a, b] },
    ]);
    expect(isPointClipped(new Vector3(-5, 5, -1), disabled)).toBe(false);
  });

  it('a single intersection-mode plane (the per-view slice cut) clips like one plane', () => {
    const cut = new Plane(new Vector3(1, 0, 0), 0); // keeps x >= 0
    const planes = clipPlaneSetsOf([{ enabled: true, clipIntersection: true, clippingPlanes: [cut] }]);
    expect(isPointClipped(new Vector3(-1, 0, 0), planes)).toBe(true);
    expect(isPointClipped(new Vector3(1, 0, 0), planes)).toBe(false);
  });
});

describe('intersectVisible', () => {
  it('skips objects under an invisible ancestor, so hidden pieces do not block visible ones', () => {
    const root = new Group();
    const hiddenPiece = new Group();
    hiddenPiece.visible = false;
    hiddenPiece.add(boxAt(10, 'hidden-front'));
    root.add(hiddenPiece);
    root.add(boxAt(0, 'visible-back'));
    root.updateMatrixWorld(true);

    const hits = intersectVisible(rayDownZ(), [root]);
    expect(hits.length).toBeGreaterThan(0);
    expect(new Set(hits.map(hit => hit.object.name))).toEqual(new Set(['visible-back']));
  });

  it('returns hits sorted by distance across roots, and nothing from an invisible root', () => {
    const near = new Group();
    near.add(boxAt(20, 'near'));
    const far = new Group();
    far.add(boxAt(-20, 'far'));
    const hidden = new Group();
    hidden.visible = false;
    hidden.add(boxAt(50, 'hidden'));
    for (const group of [near, far, hidden]) group.updateMatrixWorld(true);

    const names = intersectVisible(rayDownZ(), [far, hidden, near]).map(hit => hit.object.name);
    expect(names[0]).toBe('near');
    expect(names).not.toContain('hidden');
    expect(names.indexOf('far')).toBeGreaterThan(names.lastIndexOf('near'));
  });
});

describe('isClickGesture', () => {
  it('accepts a release within the travel threshold and rejects a drag', () => {
    const down = { clientX: 100, clientY: 100 };
    expect(isClickGesture(down, { clientX: 100, clientY: 100 })).toBe(true);
    expect(isClickGesture(down, { clientX: 103, clientY: 104 })).toBe(true);  // 5 px
    expect(isClickGesture(down, { clientX: 104, clientY: 104 })).toBe(false); // 5.7 px
    expect(isClickGesture(down, { clientX: 160, clientY: 100 })).toBe(false); // an orbit
  });
});

describe('picking BVH', () => {
  it('accepts plain meshes and rejects instanced meshes, fat lines and position-less geometry', () => {
    expect(isBvhCandidate(new Mesh(new BoxGeometry(), material))).toBe(true);
    expect(isBvhCandidate(new InstancedMesh(new BoxGeometry(), material, 4))).toBe(false);
    const fatLine = new Mesh(new BoxGeometry(), material) as Mesh & { isLineSegments2?: boolean };
    fatLine.isLineSegments2 = true;
    expect(isBvhCandidate(fatLine)).toBe(false);
    expect(isBvhCandidate(new Mesh(new BufferGeometry(), material))).toBe(false);
    expect(isBvhCandidate(new Group())).toBe(false);
  });

  it('collects candidates of a subtree and routes them, and only them, through the accelerated raycast', () => {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(), material);
    const instanced = new InstancedMesh(new BoxGeometry(), material, 2);
    root.add(mesh, instanced);
    expect(collectBvhCandidates(root)).toEqual([mesh]);

    useAcceleratedRaycast(root);
    expect(mesh.raycast).toBe(acceleratedRaycast);
    expect(instanced.raycast).toBe(InstancedMesh.prototype.raycast);
    // Never a prototype patch: other meshes keep three's raycast.
    expect(Mesh.prototype.raycast).not.toBe(acceleratedRaycast);
  });

  it('builds once per geometry, leaves the index buffer untouched and finds the same hits', () => {
    const geometry = new SphereGeometry(5, 32, 16);
    const indexBefore = geometry.index!.array.slice();
    const doubleSided = new MeshBasicMaterial({ side: DoubleSide });
    const plain = new Mesh(geometry.clone(), doubleSided);
    const accelerated = new Mesh(geometry, doubleSided);
    const copy = accelerated.clone(); // shares the geometry, as slice copies do
    for (const mesh of [plain, accelerated, copy]) mesh.updateMatrixWorld(true);

    expect(buildPickingBvh(accelerated)).toBe(true);
    expect(buildPickingBvh(copy)).toBe(false); // shared geometry: one BVH
    expect(copy.geometry.boundsTree).toBe(accelerated.geometry.boundsTree);
    expect([...geometry.index!.array]).toEqual([...indexBefore]);

    const ray = new Raycaster(new Vector3(0.3, 0.2, 20), new Vector3(0, 0, -1));
    const expected = ray.intersectObject(plain).map(hit => hit.distance.toFixed(6));
    const actual = ray.intersectObject(accelerated).map(hit => hit.distance.toFixed(6));
    expect(actual).toEqual(expected);
    expect(actual.length).toBe(2); // in and out through the double-sided sphere
  });

  it('leaves non-indexed geometry non-indexed', () => {
    const geometry = new BoxGeometry().toNonIndexed();
    const mesh = new Mesh(geometry, material);
    buildPickingBvh(mesh);
    expect(geometry.index).toBeNull();
    expect(geometry.boundsTree).toBeDefined();
  });
});
