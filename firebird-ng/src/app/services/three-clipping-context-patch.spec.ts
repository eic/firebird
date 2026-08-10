/**
 * Regression tests for patchThreeClippingContextArrayStability.
 *
 * The patch protects against a three.js bug where ClippingContext.update()
 * replaces its plane arrays while built shader states keep reading the old
 * array instances — clipping planes then freeze in camera space and follow
 * the camera. These tests run the patch against the REAL ClippingContext
 * class and simulate the group-toggle sequences that trigger the bug, so a
 * three upgrade that moves the internals fails here instead of silently
 * un-fixing the display.
 *
 * The `three/src/...` import below is TEST-ONLY and deliberate: the class is
 * not exported from `three/webgpu`, and this spec never runs in the browser
 * bundle (where a second copy of three's node system would corrupt TSL
 * state). Do not copy this import into app code.
 */
import ClippingContext from 'three/src/renderers/common/ClippingContext.js';
import { Matrix4, Plane, Vector3 } from 'three';
import { patchThreeClippingContextArrayStability } from './three.service';

type AnyCtx = {
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

function rendererHolding(clippingContext: object): never {
  // Shape-only stand-in matching where applyOnce() looks for a live instance.
  return { _renderContexts: { _renderContexts: { 'default-default-0': { clippingContext } } } } as never;
}

describe('patchThreeClippingContextArrayStability', () => {
  it('warns (once) instead of patching when internals are unrecognized', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Prototype without an update() — simulates a three upgrade moving the API.
    patchThreeClippingContextArrayStability.applyOnce(rendererHolding({}));
    patchThreeClippingContextArrayStability.applyOnce(rendererHolding({}));
    expect(patchThreeClippingContextArrayStability.patched).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('keeps plane-array identity stable across clipping-group reparenting', () => {
    const root = new ClippingContext() as AnyCtx;
    const camera = makeCamera();
    root.updateGlobal(SCENE, camera);

    patchThreeClippingContextArrayStability.applyOnce(rendererHolding(root as object));
    expect(patchThreeClippingContextArrayStability.patched).toBe(true);

    const zGroup = makeGroup([new Plane(new Vector3(0, 0, 1), 0)], false);
    const wedgeGroup = makeGroup(
      [new Plane(new Vector3(0, -1, 0), 0), new Plane(new Vector3(1, 0, 0), 0)],
      true,
    );

    // Angular only: wedge context parented to the root.
    const wedgeCtx = root.getGroupContext(wedgeGroup);
    const intersection = wedgeCtx.intersectionPlanes; // what a built shader captures
    const union = wedgeCtx.unionPlanes;
    expect(intersection.length).toBe(2);
    expect(union.length).toBe(0);

    // Z group enabled: the wedge context is reparented under the Z context.
    // Unpatched three replaces both arrays here (parent-version resync).
    const zCtx = root.getGroupContext(zGroup);
    const wedgeCtxUnderZ = zCtx.getGroupContext(wedgeGroup);
    expect(wedgeCtxUnderZ).toBe(wedgeCtx); // one context per group, whatever the parent
    expect(wedgeCtx.intersectionPlanes).toBe(intersection);
    expect(wedgeCtx.unionPlanes).toBe(union);
    expect(intersection.length).toBe(2);
    expect(union.length).toBe(1); // inherited Z plane

    // Z group disabled again: reparented back to the root.
    const wedgeCtxBack = root.getGroupContext(wedgeGroup);
    expect(wedgeCtxBack).toBe(wedgeCtx);
    expect(wedgeCtx.intersectionPlanes).toBe(intersection);
    expect(wedgeCtx.unionPlanes).toBe(union);
    expect(intersection.length).toBe(2);
    expect(union.length).toBe(0);
  });

  it('re-projects planes into the captured arrays when the camera moves', () => {
    const root = new ClippingContext() as AnyCtx;
    const camera = makeCamera();
    root.updateGlobal(SCENE, camera);

    const wedgeGroup = makeGroup([new Plane(new Vector3(0, -1, 0), 0)], true);
    const wedgeCtx = root.getGroupContext(wedgeGroup);
    const captured = wedgeCtx.intersectionPlanes; // shader-held reference
    const before = captured[0].w;

    camera.matrixWorldInverse.makeTranslation(0, 100, 0);
    root.updateGlobal(SCENE, camera);
    root.getGroupContext(wedgeGroup); // per-frame update path

    expect(wedgeCtx.intersectionPlanes).toBe(captured);
    expect(captured[0].w).not.toBe(before);
  });
});
