/**
 * Canary tests pinning the three.js clipping internals that
 * `ThreeService.dropClippingShaderState()` compensates for.
 *
 * Built shader states bind clipping planes to the ARRAY INSTANCE their
 * ClippingContext held at build time, and the state cache is keyed by plane
 * COUNTS. ClippingContext.update() REPLACES its arrays whenever the parent
 * group chain changes (an outer clipping group toggled on or off), so a
 * toggle that returns to a previously-seen count shape would reuse a shader
 * bound to an orphaned array whose view-space values are never re-projected
 * again — the cut freezes to the camera. Firebird's answer is to drop the
 * renderer's cached render objects AND built node states on every clipping
 * STRUCTURE change (see three.service.ts).
 *
 * These tests assert that three still behaves that way. If a three upgrade
 * makes the "replaces arrays" test fail, the upstream defect is likely fixed
 * — re-evaluate whether dropClippingShaderState() still needs to clear the
 * node builder cache.
 *
 * The `three/src/...` import below is TEST-ONLY and deliberate: the class is
 * not exported from `three/webgpu`, and this spec never runs in the browser
 * bundle (where a second copy of three's node system would corrupt TSL
 * state). Do not copy this import into app code.
 */
import ClippingContext from 'three/src/renderers/common/ClippingContext.js';
import { Matrix4, Plane, Vector3 } from 'three';

type AnyCtx = {
  cacheKey: string;
  intersectionPlanes: { x: number; y: number; z: number; w: number }[];
  unionPlanes: { x: number; y: number; z: number; w: number }[];
  updateGlobal(scene: unknown, camera: unknown): void;
  getGroupContext(group: unknown): AnyCtx;
};

function makeGroup(planes: Plane[], clipIntersection: boolean) {
  return { isClippingGroup: true, enabled: true, clipShadows: false, clipIntersection, clippingPlanes: planes };
}

function makeCamera() {
  return { matrixWorldInverse: new Matrix4() };
}

const SCENE = { overrideMaterial: null };

describe('three ClippingContext internals (pinned)', () => {
  it('REPLACES plane arrays when the parent group chain changes (why the node cache must be evicted)', () => {
    const root = new ClippingContext() as AnyCtx;
    root.updateGlobal(SCENE, makeCamera());

    const zGroup = makeGroup([new Plane(new Vector3(0, 0, 1), 0)], false);
    const wedgeGroup = makeGroup(
      [new Plane(new Vector3(0, -1, 0), 0), new Plane(new Vector3(1, 0, 0), 0)],
      true,
    );

    // Angular only: wedge context parented to the root.
    const wedgeCtx = root.getGroupContext(wedgeGroup);
    const intersection = wedgeCtx.intersectionPlanes; // what a built shader captures
    expect(intersection.length).toBe(2);

    // Z group enabled: the wedge context is reparented under the Z context.
    // three resyncs by REPLACING both arrays — the captured `intersection`
    // instance is orphaned. A cached shader state keeps reading it.
    const zCtx = root.getGroupContext(zGroup);
    const wedgeCtxUnderZ = zCtx.getGroupContext(wedgeGroup);
    expect(wedgeCtxUnderZ).toBe(wedgeCtx); // one context per group, whatever the parent
    expect(wedgeCtx.intersectionPlanes).not.toBe(intersection);
    // If this starts failing (arrays kept stable), three fixed the defect:
    // re-evaluate dropClippingShaderState()'s node-cache eviction.
  });

  it('re-projects plane VALUES into the current arrays on every update call (per-view value swaps)', () => {
    // RenderView.clipPlane relies on this: sequential per-view renders write
    // different values into ONE shared plane, and every render call
    // re-projects them with the current camera.
    const root = new ClippingContext() as AnyCtx;
    const camera = makeCamera();
    root.updateGlobal(SCENE, camera);

    const group = makeGroup([new Plane(new Vector3(0, -1, 0), 0)], true);
    const ctx = root.getGroupContext(group);
    const held = ctx.intersectionPlanes;
    const before = held[0].w;

    camera.matrixWorldInverse.makeTranslation(0, 100, 0);
    root.updateGlobal(SCENE, camera);
    root.getGroupContext(group); // per-render update path

    expect(ctx.intersectionPlanes).toBe(held); // no structure change, no replacement
    expect(held[0].w).not.toBe(before);
  });

  it('cache key encodes plane COUNTS only — sibling groups with equal shapes collide', () => {
    // This is why ClippedGeometrySlice uses a (1 intersection : 0 union)
    // shape the main clipping chain can never produce: two groups with the
    // same shape share one built shader state bound to ONE group's array,
    // and the other group would clip with the wrong planes.
    const root = new ClippingContext() as AnyCtx;
    root.updateGlobal(SCENE, makeCamera());

    const groupA = makeGroup([new Plane(new Vector3(0, 0, 1), 0)], false);
    const groupB = makeGroup([new Plane(new Vector3(1, 0, 0), 500)], false);
    const ctxA = root.getGroupContext(groupA);
    const ctxB = root.getGroupContext(groupB);

    expect(ctxA).not.toBe(ctxB);
    expect(ctxA.cacheKey).toBe(ctxB.cacheKey); // "0:1" === "0:1" — the landmine

    // The slice's intersection-mode single plane has a distinct shape:
    const sliceLike = makeGroup([new Plane(new Vector3(0, -1, 0), 0)], true);
    expect(root.getGroupContext(sliceLike).cacheKey).not.toBe(ctxA.cacheKey);
  });
});
