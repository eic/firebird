/**
 * Selects three's fragment-shader path for union clipping planes.
 *
 * Union planes (a `ClippingGroup` with `clipIntersection = false`: the wedge
 * at 180 degrees or more, and the Z plane) can clip in two places:
 * - hardware clip distances, when the device offers them (WebGPU
 *   `clip-distances`, WebGL `ANGLE_clip_cull_distance`);
 * - a discard in the fragment shader, otherwise.
 *
 * Through three r185 the hardware decision was stored on a temporary node
 * material and lost before draw time, so union planes silently stopped
 * clipping on hardware that offers clip distances. three r186 carries the
 * decision on the node builder state, which fixes that. This patch remains
 * so that every backend and device clips through the same fragment-shader
 * path, which keeps clip edges identical between the WebGPU renderer and the
 * WebGL2 fallback and keeps the pixel baselines device-independent.
 *
 * The patch replaces `NodeMaterial.prototype.setupHardwareClipping` with a
 * version that never selects hardware clipping. `NodeBuilder` starts with
 * `hardwareClipping = false`, and `ClippingNode` emits the fragment-shader
 * union loop only for an explicit `false`, so union planes then clip in the
 * fragment shader. three-clipping-patch.spec.ts pins those three facts;
 * when it fails after a three upgrade, re-check the patch against the new
 * `setupHardwareClipping`.
 *
 * Removing the patch is a deliberate rendering change: union-plane edges
 * then come from hardware clipping where available, so re-capture the pixel
 * baselines of every view that clips with union planes.
 */

import { NodeMaterial } from 'three/webgpu';

type HardwareClippingBuilder = { hardwareClipping: boolean };

let patched = false;

/** Applies the patch once per page; later calls do nothing. */
export function useFragmentShaderClipping(): void {
  if (patched) return;
  patched = true;
  (NodeMaterial.prototype as unknown as { setupHardwareClipping: (builder: HardwareClippingBuilder) => void })
    .setupHardwareClipping = function (builder: HardwareClippingBuilder): void {
      builder.hardwareClipping = false;
    };
}
