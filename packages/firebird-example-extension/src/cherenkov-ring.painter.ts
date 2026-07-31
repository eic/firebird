/**
 * Painter side of the example extension: turns CherenkovRingGroup data into
 * three.js objects, time-aware (rings appear at their production time), with
 * a config-driven ring color.
 *
 * A painter is a @firebird/core citizen too: it paints without DI, so it can
 * run in web workers. The ring color follows a config key through the shared
 * ringStyle object, wired by the pack's initializer (see index.ts).
 */

import { BufferGeometry, Color, Group, Line, LineBasicMaterial, Object3D, Vector3 } from 'three';
import { EventGroup, EventGroupPainter } from '@firebird/core';
import { CherenkovRing, CherenkovRingGroup } from './cherenkov-ring.group';
import { ringStyle } from './ring-style';

const RING_SEGMENTS = 64;

export class CherenkovRingPainter extends EventGroupPainter {

  static meta = {
    id: 'example-cherenkov-rings',
    forGroupTypes: [CherenkovRingGroup.type],
    label: 'Cherenkov rings (example extension)',
  };

  private ringObjects: { object: Line; ring: CherenkovRing }[] = [];

  constructor(parentNode: Object3D, component: EventGroup) {
    super(parentNode, component);
    const group = component as CherenkovRingGroup;

    const container = new Group();
    container.name = `${group.name}_rings`;
    parentNode.add(container);

    for (const ring of group.rings) {
      const object = this.buildRing(ring);
      container.add(object);
      this.ringObjects.push({ object, ring });
    }
  }

  /** A ring is a closed line strip in the XY plane at the ring's center (facing +Z).
   * Closed Line, not LineLoop: WebGPURenderer does not support LineLoop objects. */
  private buildRing(ring: CherenkovRing): Line {
    const points: Vector3[] = [];
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const angle = (i / RING_SEGMENTS) * Math.PI * 2;
      points.push(new Vector3(
        ring.center[0] + ring.radius * Math.cos(angle),
        ring.center[1] + ring.radius * Math.sin(angle),
        ring.center[2],
      ));
    }
    const geometry = new BufferGeometry().setFromPoints(points);
    // ringStyle.color follows the 'examples.cherenkov.ringColor' config key
    const material = new LineBasicMaterial({ color: new Color(ringStyle.color) });
    const line = new Line(geometry, material);
    line.name = `CherenkovRing_r${ring.radius}`;
    return line;
  }

  /** Time-aware: a ring is visible once the event time passed its production time. */
  override paint(time: number | null): void {
    for (const { object, ring } of this.ringObjects) {
      object.visible = time === null || ring.time <= time;
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
