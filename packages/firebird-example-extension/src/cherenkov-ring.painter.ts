/**
 * Painter side of the example extension: turns CherenkovRingPiece data into
 * three.js objects, time-aware (rings appear at their production time), with
 * a config-driven ring color.
 *
 * A painter is a @firebird/core citizen too: it paints without DI, so it can
 * run in web workers. The ring color follows a config key through the shared
 * ringStyle object, wired by the pack's initializer (see index.ts).
 */

import { BufferGeometry, Color, Group, Line, LineBasicMaterial, Object3D, Vector3 } from 'three';
import { EventPiece, EventPiecePainter } from '@firebird/core';
import { CherenkovRingPiece } from './cherenkov-ring.piece';
import { ringStyle } from './ring-style';

const RING_SEGMENTS = 64;

export class CherenkovRingPainter extends EventPiecePainter {

  static meta = {
    id: 'example-cherenkov-rings',
    forPieceTypes: [CherenkovRingPiece.type],
    label: 'Cherenkov rings (example extension)',
  };

  private ringObjects: { object: Line; time: number }[] = [];

  constructor(parentNode: Object3D, piece: EventPiece) {
    super(parentNode, piece);
    const rings = piece as CherenkovRingPiece;

    const container = new Group();
    container.name = `${rings.name}_rings`;
    parentNode.add(container);

    // Columnar read: ring i lives at center[3i..3i+2], radius[i], time[i]
    for (let i = 0; i < rings.count; i++) {
      const object = this.buildRing(rings, i);
      container.add(object);
      this.ringObjects.push({ object, time: rings.time !== null ? rings.time[i] : 0 });

      // Selection mapping: ring id ≡ index; highlight = white tint (the
      // ring material is per-ring, so recoloring is safe)
      this.registerEntityObject(i, object);
      object.userData['highlightFunction'] = () =>
        (object.material as LineBasicMaterial).color.set(0xffffff);
      object.userData['unhighlightFunction'] = () =>
        (object.material as LineBasicMaterial).color.set(ringStyle.color);
    }
  }

  /** A ring is a closed line strip in the XY plane at the ring's center (facing +Z).
   * Closed Line, not LineLoop: WebGPURenderer does not support LineLoop objects. */
  private buildRing(rings: CherenkovRingPiece, ringIndex: number): Line {
    const cx = rings.center[3 * ringIndex];
    const cy = rings.center[3 * ringIndex + 1];
    const cz = rings.center[3 * ringIndex + 2];
    const radius = rings.radius[ringIndex];

    const points: Vector3[] = [];
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const angle = (i / RING_SEGMENTS) * Math.PI * 2;
      points.push(new Vector3(
        cx + radius * Math.cos(angle),
        cy + radius * Math.sin(angle),
        cz,
      ));
    }
    const geometry = new BufferGeometry().setFromPoints(points);
    // ringStyle.color follows the 'examples.cherenkov.ringColor' config key
    const material = new LineBasicMaterial({ color: new Color(ringStyle.color) });
    const line = new Line(geometry, material);
    line.name = `CherenkovRing_r${radius}`;
    return line;
  }

  /** Time-aware: a ring is visible once the event time passed its production time. */
  override paint(time: number | null): void {
    for (const { object, time: ringTime } of this.ringObjects) {
      object.visible = time === null || ringTime <= time;
      (object.material as LineBasicMaterial).color.set(ringStyle.color);
    }
  }

  override dispose(): void {
    for (const { object } of this.ringObjects) {
      object.geometry.dispose();
      (object.material as LineBasicMaterial).dispose();
    }
    this.ringObjects = [];
    super.dispose();
  }
}
