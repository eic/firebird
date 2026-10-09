/**
 * Painter side of the example extension: turns CherenkovRingPiece data into
 * three.js objects, time-aware (rings appear at their production time), with
 * the ring color as a painter knob.
 *
 * A painter is a @dexvis/firebird-core citizen too: it paints without DI, so
 * it can run in web workers. Its knobs are declared in `static meta.configs`;
 * the display turns each into the config key
 * `painters.byPiece.<pieceName>.<knob>`, renders it in the painter panel, and
 * hands the resolved values to the painter through `this.config`.
 */

import { BufferGeometry, Color, Group, Line, LineBasicMaterial, Object3D, Vector3 } from 'three';
import { EventPiece, EventPiecePainter, PainterConfigView, PainterMeta } from '@dexvis/firebird-core';
import { CherenkovRingPiece } from './cherenkov-ring.piece';

const RING_SEGMENTS = 64;

/** Highlight tint of a selected ring. */
const HIGHLIGHT_COLOR = 0xffffff;

export class CherenkovRingPainter extends EventPiecePainter {

  static meta: PainterMeta = {
    id: 'example-cherenkov-rings',
    forPieceTypes: [CherenkovRingPiece.type],
    label: 'Cherenkov rings (example extension)',
    configs: [
      // Settable from the painter panel, a deep link
      // (?config.painters.byPiece.ExampleRings.ringColor=%23ff0000), the
      // server config or a pack's withConfigDefaults()
      { key: 'ringColor', default: '#00e5ff', label: 'Ring color' },
    ],
  };

  private ringObjects: { object: Line; time: number }[] = [];
  /** The index of the highlighted ring, or -1: a restyle must keep its tint. */
  private highlightedRing = -1;

  constructor(parentNode: Object3D, piece: EventPiece, config?: PainterConfigView) {
    super(parentNode, piece, config);
    const rings = piece as CherenkovRingPiece;

    const container = new Group();
    container.name = `${rings.name}_rings`;
    parentNode.add(container);

    // Columnar read: ring i lives at center[3i..3i+2], radius[i], time[i]
    for (let i = 0; i < rings.count; i++) {
      const object = this.buildRing(rings, i);
      container.add(object);
      this.ringObjects.push({ object, time: rings.time !== null ? rings.time[i] : 0 });
      // Selection mapping: ring id ≡ index
      this.registerEntityObject(i, object);
    }
  }

  /** A ring is a closed line strip in the XY plane at the ring's center (facing +Z).
   * A Line with the first point repeated: WebGPURenderer skips LineLoop objects. */
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
    // One material per ring: highlighting recolors a single ring
    const material = new LineBasicMaterial({ color: new Color(this.config.value<string>('ringColor')) });
    const line = new Line(geometry, material);
    line.name = `CherenkovRing_r${radius}`;
    return line;
  }

  /**
   * Restyles the existing rings when a knob changes: no rebuild. The display
   * schedules the next frame after this call (render-on-demand invalidate).
   */
  override onConfigChanged(): void {
    const ringColor = this.config.value<string>('ringColor');
    this.ringObjects.forEach(({ object }, index) => {
      (object.material as LineBasicMaterial).color.set(index === this.highlightedRing ? HIGHLIGHT_COLOR : ringColor);
    });
  }

  override highlightEntity(entityIndex: number): void {
    this.highlightedRing = entityIndex;
    this.onConfigChanged();
  }

  override unhighlightEntity(entityIndex: number): void {
    if (this.highlightedRing === entityIndex) this.highlightedRing = -1;
    this.onConfigChanged();
  }

  /** Time-aware: a ring is visible once the event time passed its production time. */
  override paint(time: number | null): void {
    for (const { object, time: ringTime } of this.ringObjects) {
      object.visible = time === null || ringTime <= time;
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
