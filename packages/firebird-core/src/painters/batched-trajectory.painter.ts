import {EventPiecePainter, PainterConfigView, PainterMeta} from "./event-piece-painter";
import {EventPiece} from "../model/event-piece";
import {PointTrajectoryPiece} from "../model/point-trajectory.piece";
import {NeonTrackColors, pidColorFor, pidIsDashed} from "./trajectory.painter";

import {Color, Object3D, Intersection} from "three";
// Import from three/webgpu, NEVER from three/src/... — see trajectory.painter.ts
import {Line2NodeMaterial} from "three/webgpu";
import {LineSegmentsGeometry} from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import {LineSegments2} from "three/examples/jsm/lines/webgpu/LineSegments2.js";

/**
 * One draw call worth of segments: every trajectory of the piece that shares
 * a dash style lives in a single LineSegments2. Segments are sorted by their
 * START time, so revealing the event up to time t is one instanceCount write
 * (the same segment granularity the per-track painter reveals with).
 */
interface SegmentBatch {
  object: LineSegments2;
  geometry: LineSegmentsGeometry;
  material: Line2NodeMaterial;
  /** Total segments in the batch. */
  count: number;
  /** Per segment, ascending: the segment's start-point time. */
  startTimes: Float32Array;
  /** Per segment (sorted order): the trajectory id it belongs to. */
  trackIds: Uint32Array;
  /** Per segment (sorted order): 6 floats, start rgb + end rgb. */
  colors: Float32Array;
  dashed: boolean;
}

/**
 * Alternative painter for "PointTrajectory" pieces that batches ALL
 * trajectories into two objects (solid + dashed) instead of one Line2 per
 * trajectory.
 *
 * Why: the per-track painter costs one scene object + one material per
 * trajectory. Measured on a 53k-trajectory background frame that is ~0.8 s of
 * construction and, far worse, >10 s PER FRAME of draw submission — the
 * renderer, not the build, is what freezes the browser. Batched, the same
 * piece renders in 2 draw calls with 2 materials.
 *
 * Select it per piece through the normal painter selection config:
 * `painters.byPiece.<pieceName> = trajectory-lines-batched` (panel dropdown,
 * yaml, or URL `?config.painters.byPiece.MCParticles=trajectory-lines-batched`)
 * — the per-track painter stays registered, so the two are switchable live
 * for comparison.
 *
 * Batching trade-offs vs the per-track painter:
 * - per-track coloring is kept (per-segment color attribute; material color
 *   stays white because vertex colors MULTIPLY it);
 * - line width and dash pattern are per MATERIAL, so all tracks of a batch
 *   share them (optical photons lose their thinner-line special case);
 * - highlight recolors the track's segments (no width change);
 * - 3D picking cannot use one-object-per-entity stamps — the batch object
 *   carries an `entityIndexResolver` that maps the picked segment
 *   (intersection.faceIndex) back to the trajectory id.
 */
export class BatchedTrajectoryPainter extends EventPiecePainter {

  static meta: PainterMeta = {
    id: 'trajectory-lines-batched',
    forPieceTypes: [PointTrajectoryPiece.type],
    label: 'Trajectory lines (batched)',
    configs: [
      { key: 'colorMode', default: 'pid', options: ['pid', 'momentum', 'solid'], label: 'Coloring' },
      { key: 'lineWidth', default: 30, min: 1, max: 300, step: 1, label: 'Line width [mm]' },
      { key: 'color', default: '#00b7ff', label: 'Solid color' },
    ],
  };

  public readonly trackColorHighlight = 0xff4081;

  private batches: SegmentBatch[] = [];
  private timeIndex = -1;
  /** Momentum ceiling of the piece, for the momentum color scale. */
  private maxMomentum = 0;
  private highlightedTrack: number | null = null;

  constructor(parentNode: Object3D, piece: EventPiece, config?: PainterConfigView) {
    super(parentNode, piece, config);
    if (piece.type !== PointTrajectoryPiece.type) {
      throw new Error("Wrong piece type given to BatchedTrajectoryPainter.");
    }
    this.timeIndex = (piece as PointTrajectoryPiece).pointColumns.indexOf('t');
    this.buildBatches();
    this.applyStyles();
  }

  private get trajectoryPiece(): PointTrajectoryPiece {
    return this.piece as PointTrajectoryPiece;
  }

  /** Whether this track renders in the dashed batch (fixed at build, like the per-track painter). */
  private trackIsDashed(trackIndex: number): boolean {
    const pdg = this.trackParamNumber('pdg', trackIndex);
    return pidIsDashed(pdg === null ? 0 : Math.floor(pdg));
  }

  private trackParamNumber(column: string, trackIndex: number): number | null {
    const value = this.trajectoryPiece.param(column, trackIndex);
    return typeof value === 'number' ? value : null;
  }

  private buildBatches(): void {
    const piece = this.trajectoryPiece;
    const buildStart = performance.now();

    // Pass 1: count segments per dash style
    const counts = [0, 0]; // [solid, dashed]
    const dashedOf = new Uint8Array(piece.count);
    for (let trackIndex = 0; trackIndex < piece.count; trackIndex++) {
      const points = piece.points[trackIndex];
      if (points.length <= 1) continue;
      const dashed = this.trackIsDashed(trackIndex) ? 1 : 0;
      dashedOf[trackIndex] = dashed;
      counts[dashed] += points.length - 1;
    }

    for (const dashed of [0, 1]) {
      const count = counts[dashed];
      if (count === 0) continue;

      // Pass 2: collect (time, trackId, pointIndex) per segment, unsorted
      const times = new Float32Array(count);
      const segTrack = new Uint32Array(count);
      const segPoint = new Uint32Array(count);
      let fill = 0;
      for (let trackIndex = 0; trackIndex < piece.count; trackIndex++) {
        if (dashedOf[trackIndex] !== dashed) continue;
        const points = piece.points[trackIndex];
        if (points.length <= 1) continue;
        for (let j = 0; j < points.length - 1; j++) {
          times[fill] = this.timeIndex >= 0 ? points[j][this.timeIndex] : 0;
          segTrack[fill] = trackIndex;
          segPoint[fill] = j;
          fill++;
        }
      }

      // Sort segments by start time so a time cut is one instanceCount write
      const order = new Uint32Array(count);
      for (let i = 0; i < count; i++) order[i] = i;
      if (this.timeIndex >= 0) {
        // Typed-array sort with a comparator; ~O(n log n) on segment count
        order.sort((a, b) => times[a] - times[b]);
      }

      const positions = new Float32Array(count * 6);
      const startTimes = new Float32Array(count);
      const trackIds = new Uint32Array(count);
      for (let i = 0; i < count; i++) {
        const source = order[i];
        const trackIndex = segTrack[source];
        const points = piece.points[trackIndex];
        const start = points[segPoint[source]];
        const end = points[segPoint[source] + 1];
        const base = i * 6;
        positions[base] = start[0];
        positions[base + 1] = start[1];
        positions[base + 2] = start[2];
        positions[base + 3] = end[0];
        positions[base + 4] = end[1];
        positions[base + 5] = end[2];
        startTimes[i] = times[source];
        trackIds[i] = trackIndex;
      }

      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      const colors = new Float32Array(count * 6);
      geometry.setColors(colors); // filled by applyStyles

      // Vertex colors MULTIPLY the material color — it must stay white
      const material = new Line2NodeMaterial({
        color: 0xffffff,
        vertexColors: true,
        linewidth: this.config.value<number>('lineWidth'),
        worldUnits: true,
        dashed: dashed === 1,
        dashSize: 100,
        gapSize: 100,
        alphaToCoverage: true,
      });

      const object = new LineSegments2(geometry, material as any);
      if (dashed) object.computeLineDistances();
      object.name = `${this.pieceName}_batched_${dashed ? 'dashed' : 'solid'}`;

      const batch: SegmentBatch = {
        object,
        geometry,
        material,
        count,
        startTimes,
        trackIds,
        colors,
        dashed: dashed === 1,
      };

      // 3D picking: one object holds every track, so the entity is resolved
      // from the picked segment index, not from the object itself
      object.userData['pieceName'] = this.pieceName;
      object.userData['entityIndexResolver'] = (intersection: Intersection) => {
        const segment = intersection.faceIndex;
        return typeof segment === 'number' && segment < batch.count ? batch.trackIds[segment] : null;
      };

      this.parentNode.add(object);
      this.batches.push(batch);
    }

    const buildMs = performance.now() - buildStart;
    if (buildMs > 10) {
      const total = counts[0] + counts[1];
      console.log(`[load-timing] BatchedTrajectoryPainter '${this.pieceName}' build ` +
        `${buildMs.toFixed(1)} ms (${total} segments in ${this.batches.length} batches)`);
    }
  }

  /** The rgb of one track under the current color mode. */
  private trackColor(trackIndex: number, colorMode: string, solidColor: string, scratch: Color): Color {
    if (colorMode === 'solid') {
      return scratch.set(solidColor);
    }
    if (colorMode === 'momentum') {
      const px = this.trackParamNumber('px', trackIndex);
      const py = this.trackParamNumber('py', trackIndex);
      const pz = this.trackParamNumber('pz', trackIndex);
      if (px === null || py === null || pz === null || this.maxMomentum <= 0) {
        return scratch.setHex(NeonTrackColors.Gray);
      }
      const fraction = Math.min(1, Math.sqrt(px * px + py * py + pz * pz) / this.maxMomentum);
      // Blue (low) -> red (high), linear in |p|, same scale as the per-track painter
      return scratch.setHSL(0.66 * (1 - fraction), 1, 0.5);
    }
    const pdg = this.trackParamNumber('pdg', trackIndex);
    const charge = this.trackParamNumber('charge', trackIndex) ?? 0;
    return scratch.setHex(pidColorFor(pdg === null ? 0 : Math.floor(pdg), charge));
  }

  /** Writes one track's color into every one of its segments in one batch. */
  private colorTrackSegments(batch: SegmentBatch, trackIndex: number, color: Color): void {
    const {trackIds, colors} = batch;
    for (let i = 0; i < batch.count; i++) {
      if (trackIds[i] !== trackIndex) continue;
      const base = i * 6;
      colors[base] = colors[base + 3] = color.r;
      colors[base + 1] = colors[base + 4] = color.g;
      colors[base + 2] = colors[base + 5] = color.b;
    }
  }

  /** Pushes a batch's `colors` array into its geometry attribute. */
  private uploadColors(batch: SegmentBatch): void {
    const attribute = batch.geometry.attributes['instanceColorStart'];
    if (attribute && 'data' in attribute) {
      (attribute as unknown as { data: { array: Float32Array; needsUpdate: boolean } })
        .data.array.set(batch.colors);
      (attribute as unknown as { data: { needsUpdate: boolean } }).data.needsUpdate = true;
    } else {
      batch.geometry.setColors(batch.colors);
    }
  }

  override onConfigChanged(): void {
    this.applyStyles();
  }

  /** Recolors every segment and applies the shared width; drops any highlight. */
  private applyStyles(): void {
    const colorMode = this.config.value<string>('colorMode');
    const lineWidth = this.config.value<number>('lineWidth');
    const solidColor = this.config.value<string>('color');
    const piece = this.trajectoryPiece;

    if (colorMode === 'momentum' && this.maxMomentum === 0) {
      for (let trackIndex = 0; trackIndex < piece.count; trackIndex++) {
        const px = this.trackParamNumber('px', trackIndex) ?? 0;
        const py = this.trackParamNumber('py', trackIndex) ?? 0;
        const pz = this.trackParamNumber('pz', trackIndex) ?? 0;
        this.maxMomentum = Math.max(this.maxMomentum, Math.sqrt(px * px + py * py + pz * pz));
      }
    }

    // Per-track colors once, then per-segment fill through the sorted order
    const scratch = new Color();
    const trackRgb = new Float32Array(piece.count * 3);
    for (let trackIndex = 0; trackIndex < piece.count; trackIndex++) {
      const color = this.trackColor(trackIndex, colorMode, solidColor, scratch);
      trackRgb[trackIndex * 3] = color.r;
      trackRgb[trackIndex * 3 + 1] = color.g;
      trackRgb[trackIndex * 3 + 2] = color.b;
    }

    for (const batch of this.batches) {
      for (let i = 0; i < batch.count; i++) {
        const track = batch.trackIds[i] * 3;
        const base = i * 6;
        batch.colors[base] = batch.colors[base + 3] = trackRgb[track];
        batch.colors[base + 1] = batch.colors[base + 4] = trackRgb[track + 1];
        batch.colors[base + 2] = batch.colors[base + 5] = trackRgb[track + 2];
      }
      this.uploadColors(batch);
      batch.material.linewidth = lineWidth;
      batch.material.needsUpdate = true;
    }
    // A restyle repainted the highlight color away, same as the per-track painter
    this.highlightedTrack = null;
  }

  override highlightEntity(entityIndex: number): void {
    if (this.highlightedTrack !== null) this.unhighlightEntity(this.highlightedTrack);
    const scratch = new Color().setHex(this.trackColorHighlight);
    for (const batch of this.batches) {
      this.colorTrackSegments(batch, entityIndex, scratch);
      this.uploadColors(batch);
    }
    this.highlightedTrack = entityIndex;
  }

  override unhighlightEntity(entityIndex: number): void {
    const scratch = new Color();
    const color = this.trackColor(
      entityIndex,
      this.config.value<string>('colorMode'),
      this.config.value<string>('color'),
      scratch,
    );
    for (const batch of this.batches) {
      this.colorTrackSegments(batch, entityIndex, color);
      this.uploadColors(batch);
    }
    if (this.highlightedTrack === entityIndex) this.highlightedTrack = null;
  }

  /**
   * Time cut: segments are pre-sorted by start time, so painting at time t is
   * a binary search + one instanceCount write per batch — the same segment
   * granularity the per-track painter reveals with (a segment shows once its
   * start point's time has passed).
   */
  public override paint(time: number | null): void {
    for (const batch of this.batches) {
      if (time === null || this.timeIndex < 0) {
        batch.geometry.instanceCount = batch.count;
        continue;
      }
      // Upper bound: first index with startTime > time
      let low = 0, high = batch.count;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (batch.startTimes[mid] <= time) low = mid + 1;
        else high = mid;
      }
      batch.geometry.instanceCount = low;
    }
  }

  public override dispose(): void {
    for (const batch of this.batches) {
      batch.geometry.dispose();
      batch.material.dispose();
      this.parentNode?.remove(batch.object);
    }
    this.batches = [];
    super.dispose();
  }
}
