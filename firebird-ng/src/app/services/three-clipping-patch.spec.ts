/**
 * Pins the three.js facts `useFragmentShaderClipping()` relies on (see
 * three-clipping-patch.ts). If one of these fails after a three upgrade,
 * re-check the patch against the new `NodeMaterial.setupHardwareClipping`.
 *
 * The `three/src/...` import below is TEST-ONLY and deliberate: RenderObject
 * is not exported from `three/webgpu`, and this spec never runs in the
 * browser bundle (where a second copy of three's node system would corrupt
 * TSL state). Do not copy this import into app code.
 */
// @ts-ignore -- RenderObject ships no type declarations; test-only import.
import RenderObject from 'three/src/renderers/common/RenderObject.js';
import { Plane, Vector3 } from 'three';
import { NodeBuilder, NodeMaterial } from 'three/webgpu';
import { useFragmentShaderClipping } from './three-clipping-patch';

type SetupHardwareClipping = (this: unknown, builder: unknown) => void;
const prototype = NodeMaterial.prototype as unknown as { setupHardwareClipping: SetupHardwareClipping };
const original = prototype.setupHardwareClipping;

/** A builder stub offering clip distances, with two union planes in its clipping context. */
function stubBuilder() {
  const stack: unknown[] = [];
  return {
    hardwareClipping: false,
    clippingContext: {
      unionPlanes: [new Plane(new Vector3(0, -1, 0), 0), new Plane(new Vector3(0, 1, 0), 0)],
      intersectionPlanes: [],
    },
    isAvailable: (feature: string) => feature === 'clipDistance',
    stack: { addToStack: (node: unknown) => stack.push(node) },
    pushed: stack,
  };
}

describe('three hardware clipping (pinned for useFragmentShaderClipping)', () => {
  afterAll(() => {
    prototype.setupHardwareClipping = original;
  });

  it('unpatched three selects hardware clipping when the device offers clip distances', () => {
    const builder = stubBuilder();
    original.call(new NodeMaterial(), builder);
    expect(builder.hardwareClipping).toBe(true);
    expect(builder.pushed.length).toBe(1);
  });

  it('a new NodeBuilder starts with hardwareClipping === false (the fragment-shader union loop)', () => {
    // NodeBuilder is abstract in the type declarations, concrete at runtime.
    const Builder = NodeBuilder as unknown as new (object: null, renderer: null, parser: null) => { hardwareClipping: unknown };
    const builder = new Builder(null, null, null);
    expect(builder.hardwareClipping).toBe(false);
  });

  it('the draw call reads the decision from the node builder state, not from the material', () => {
    const getter = Object.getOwnPropertyDescriptor(RenderObject.prototype, 'hardwareClippingPlanes')?.get;
    expect(getter).toBeDefined();
    const withState = (hardwareClipping: boolean) => ({
      getNodeBuilderState: () => ({ hardwareClipping }),
      clippingContext: { unionClippingCount: 2 },
      material: { hardwareClipping: true },
    });
    expect(getter!.call(withState(false))).toBe(0);
    expect(getter!.call(withState(true))).toBe(2);
  });

  it('after the patch, union planes never select hardware clipping', () => {
    useFragmentShaderClipping();
    const builder = stubBuilder();
    builder.hardwareClipping = true;
    prototype.setupHardwareClipping.call(new NodeMaterial(), builder);
    expect(builder.hardwareClipping).toBe(false);
    expect(builder.pushed.length).toBe(0);
  });
});
