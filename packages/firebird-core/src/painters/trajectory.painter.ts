import {EventPiecePainter, PainterConfigView, PainterMeta} from "./event-piece-painter";
import {EventPiece} from "../model/event-piece";
import {PointTrajectoryPiece} from "../model/point-trajectory.piece";

import {Color, Object3D} from "three";
// Import from three/webgpu, NEVER from three/src/... : a deep src import can
// be served as a second copy of the whole three node system (seen with the
// vite dep optimizer), whose module-level TSL stack state is separate from
// the renderer's — the material build then throws "No stack defined for
// assign operation" and tracks render as bare hairlines.
import {Line2NodeMaterial} from "three/webgpu";
import {LineGeometry} from "three/examples/jsm/lines/LineGeometry.js";
import {Line2} from "three/examples/jsm/lines/webgpu/Line2.js";



/** Example color set. Feel free to refine or expand. */
export enum NeonTrackColors {
  Red = 0xFF0007,
  Pink = 0xCF00FF,
  Violet = 0x5400FF,
  Blue = 0x0097FF,
  DeepBlue = 0x003BFF,
  Teal = 0x00FFD1,
  Green = 0x13FF00,
  Salad = 0x8CFF00,
  Yellow = 0xFFEE00,
  Orange = 0xFF3500,
  Gray = 0xAAAAAA,
}

/**
 * The pid-mode track color, shared by the per-track and batched trajectory
 * painters so switching between them keeps the palette.
 */
export function pidColorFor(pdg: number, charge: number): number {
  switch (pdg) {
    case 22: return NeonTrackColors.Yellow;      // γ
    case -22: return NeonTrackColors.Salad;      // optical photon
    case 11: return NeonTrackColors.Blue;        // e⁻
    case -11: return NeonTrackColors.Orange;     // e⁺
    case 211: return NeonTrackColors.Pink;       // π⁺
    case -211: return NeonTrackColors.Teal;      // π⁻
    case 2212: return NeonTrackColors.Violet;    // proton
    case 2112: return NeonTrackColors.Green;     // neutron
  }
  if (charge > 0) return NeonTrackColors.Red;
  if (charge < 0) return NeonTrackColors.DeepBlue;
  return NeonTrackColors.Gray;
}

/** Whether pid-mode draws this particle dashed (photons and neutrons). */
export function pidIsDashed(pdg: number): boolean {
  return pdg === 22 || pdg === 2112;
}

/**
 * We'll keep each line's full data in a small structure so we can rebuild partial geometry.
 */
interface TrajectoryRenderContext {
  collectionIndex: number;           // Trajectory id == index in the piece columns
  lineObj: Line2;                    // the Line2 object in the scene
  points: number[][];                // the raw array of [x, y, z, t, dx, dy, dz, dt]
  lineMaterial: Line2NodeMaterial;        // the material used
  startTime: number;                 // The time of the first point
  endTime: number;                   // The end of the last point
  params: Record<string, any>;       // Track parameters (column name -> value at this index)
  lastPaintIndex: number;            // This is needed for partial track draw optimization
}

/**
 * Painter that draws lines for a "PointTrajectory" piece,
 * supporting partial display based on time.
 */
export class TrajectoryPainter extends EventPiecePainter {

  /**
   * Knobs: coloring mode (particle id, momentum magnitude, or one solid
   * color) and the line width in world units (mm) — 30 reads as a clear but
   * thin ribbon at detector scale; values in the hundreds cover whole
   * subdetectors. Live: changes restyle existing lines without a rebuild.
   */
  static meta: PainterMeta = {
    id: 'trajectory-lines',
    forPieceTypes: [PointTrajectoryPiece.type],
    label: 'Trajectory lines',
    configs: [
      { key: 'colorMode', default: 'pid', options: ['pid', 'momentum', 'solid'], label: 'Coloring' },
      { key: 'lineWidth', default: 30, min: 1, max: 300, step: 1, label: 'Line width [mm]' },
      { key: 'color', default: '#00b7ff', label: 'Solid color' },
    ],
  };

  /** A small array to store each line's data and references. */
  public trajectories: TrajectoryRenderContext[] = [];
  private timeColumnIndex = 3;         // TODO check that line has time column

  public readonly trackColorHighlight = 0xff4081; // vivid pink for highlight
  public readonly trackWidthFactor = 2;          // how many times thicker when highlighted

  /** Momentum ceiling [MeV] of this piece, for the momentum color scale. */
  private maxMomentum = 0;

  constructor(parentNode: Object3D, piece: EventPiece, config?: PainterConfigView) {
    super(parentNode, piece, config);

    if (piece.type !== PointTrajectoryPiece.type) {
      throw new Error("Wrong piece type given to TrajectoryPainter.");
    }

    // Build lines at construction
    this.initLines();
    this.applyStyles();
  }

  /**
   * Builds the Line2 objects for each trajectory in the piece.
   * Initially, we set them fully visible (or we could set them invisible).
   */
  private initLines() {

    const piece = this.piece as PointTrajectoryPiece;
    const columnNames = Object.keys(piece.columns);
    let noPointsWarned = 0;

    // [load-timing] accumulators: where construction time goes across ALL
    // lines of this piece (materials vs geometry vs distances vs the rest)
    const buildStart = performance.now();
    let materialMs = 0, geometryMs = 0, distancesMs = 0;
    let builtLines = 0;
    let stepStart = 0;

    for (let trajIndex = 0; trajIndex < piece.count; trajIndex++) {

      // Collect this trajectory's parameters from the columns (id == index)
      const paramsDict: Record<string, any> = {};
      for (const columnName of columnNames) {
        paramsDict[columnName] = piece.columns[columnName][trajIndex];
      }

      const points = piece.points[trajIndex];

      // Check we have enough points to build at least something!
      if (points.length <= 1) {
        if (noPointsWarned < 10) {
          const result = Object.entries(paramsDict)
            .map(([key, value]) => `${key}:${value}`)
            .join(", ");
          console.warn(`Trajectory has ${points.length} points. This can't be. Track parameters: ${result}`);
          noPointsWarned++;
        }
        continue;   // Skip this line!
      }

      // Create proper material
      stepStart = performance.now();
      const lineMaterial = this.createLine2NodeMaterial(paramsDict);
      materialMs += performance.now() - stepStart;


      // We'll start by building a geometry with *all* points, and rely on paint() to do partial logic.
      stepStart = performance.now();
      const geometry = new LineGeometry();
      const fullPositions = this.generateFlatXYZ(points);
      geometry.setPositions(fullPositions);
      geometryMs += performance.now() - stepStart;


      const line2 = new Line2(geometry, lineMaterial as any);
      stepStart = performance.now();
      line2.computeLineDistances();
      distancesMs += performance.now() - stepStart;
      builtLines++;

      // Add to the scene
      this.parentNode.add(line2);

      let startTime = 0;
      let endTime = 0;
      if (points[0].length > this.timeColumnIndex) {
        startTime = points[0][this.timeColumnIndex];
        endTime = points[points.length - 1][this.timeColumnIndex]
      }

      const trajData: TrajectoryRenderContext = {
        collectionIndex: trajIndex,
        lineObj: line2,
        lineMaterial: lineMaterial,
        points: points,
        startTime: startTime,
        endTime: endTime,
        params: paramsDict,
        lastPaintIndex: 0,
      }

      trajData.lineObj.name = this.getNodeName(trajData, piece.count);
      trajData.lineObj.userData["track_params"] = trajData.params;

      // Selection mapping: trajectory id ≡ index; the Line2 is the entity object
      this.registerEntityObject(trajIndex, trajData.lineObj);


      // Highlight captures the CURRENT material state at highlight time (not
      // at build time): the color/width knobs restyle materials live, and a
      // build-time snapshot would restore stale values.
      trajData.lineObj.userData["highlightFunction"] = () => {
        const mat = trajData.lineObj.material as unknown as Line2NodeMaterial;
        if (trajData.lineObj.userData["origColor"] === undefined) {
          trajData.lineObj.userData["origColor"] = mat.color.getHex();
          trajData.lineObj.userData["origWidth"] = mat.linewidth;
        }
        mat.color.setHex(this.trackColorHighlight);
        mat.linewidth = (trajData.lineObj.userData["origWidth"] as number) * this.trackWidthFactor;
        mat.needsUpdate = true;
      };

      trajData.lineObj.userData["unhighlightFunction"] = () => {
        // Restore original properties
        if (trajData.lineObj.userData["origColor"] !== undefined) {
          const mat = trajData.lineObj.material as unknown as Line2NodeMaterial;
          mat.color.setHex(trajData.lineObj.userData["origColor"]);
          mat.linewidth = trajData.lineObj.userData["origWidth"];
          mat.needsUpdate = true;
          delete trajData.lineObj.userData["origColor"];
          delete trajData.lineObj.userData["origWidth"];
        }
      };

      // Keep the data
      this.trajectories.push(trajData);
    }

    const totalMs = performance.now() - buildStart;
    if (totalMs > 10) {
      const otherMs = totalMs - materialMs - geometryMs - distancesMs;
      console.log(`[load-timing] TrajectoryPainter '${this.pieceName}' build ${totalMs.toFixed(1)} ms ` +
        `(${builtLines} lines): materials ${materialMs.toFixed(1)}, geometry ${geometryMs.toFixed(1)}, ` +
        `lineDistances ${distancesMs.toFixed(1)}, other ${otherMs.toFixed(1)}`);
    }
  }

  /**
   * Creates a new solid Line2NodeMaterial.
   * NOTE: We must create fresh materials instead of using .clone() because
   * Line2NodeMaterial.clone() in three.js v0.183 does NOT copy _useWorldUnits,
   * _useDash, or linewidth, causing all cloned materials to have 1px lines.
   */
  private newSolidMaterial(color: NeonTrackColors, linewidth?: number): Line2NodeMaterial {
    return new Line2NodeMaterial({
      color: color,
      linewidth: linewidth ?? this.config.value<number>('lineWidth'),
      worldUnits: true,
      dashed: false,
      alphaToCoverage: true,
    });
  }

  private newDashedMaterial(color: NeonTrackColors): Line2NodeMaterial {
    return new Line2NodeMaterial({
      color: color,
      linewidth: this.config.value<number>('lineWidth'),
      worldUnits: true,
      dashed: true,
      dashSize: 100,
      gapSize: 100,
      alphaToCoverage: true,
    });
  }

  /**
   * Creates or picks a line material based on PDG or charge, etc.
   * Reads the "pdg" and "charge" columns when the writer declared them.
   */
  private createLine2NodeMaterial(params: Record<string, any>) {

    let pdg = 0, charge = 0;
    if (typeof params["pdg"] === "number") {
      pdg = Math.floor(params["pdg"]);
    }
    if (typeof params["charge"] === "number") {
      charge = params["charge"];
    }

    // Minimal PDG-based color logic
    // ---------- PDG‑specific cases ----------
    switch (pdg) {
      case  22:   return this.newDashedMaterial(NeonTrackColors.Yellow);    // γ
      case -22:   return this.newSolidMaterial(NeonTrackColors.Salad, 3);  // optical photon
      case  11:   return this.newSolidMaterial(NeonTrackColors.Blue);      // e⁻
      case -11:   return this.newSolidMaterial(NeonTrackColors.Orange);    // e⁺
      case  211:  return this.newSolidMaterial(NeonTrackColors.Pink);      // π⁺
      case -211:  return this.newSolidMaterial(NeonTrackColors.Teal);      // π⁻
      case  2212: return this.newSolidMaterial(NeonTrackColors.Violet);    // proton
      case  2112: return this.newDashedMaterial(NeonTrackColors.Green);    // neutron
    }

    // ---------- Fallback by charge ----------
    if (charge > 0) return this.newSolidMaterial(NeonTrackColors.Red);
    if (charge < 0) return this.newSolidMaterial(NeonTrackColors.DeepBlue);

    // Neutral fallback
    return this.newSolidMaterial(NeonTrackColors.Gray);
  }

  /** |p| [MeV] from the px/py/pz columns, or null when the writer omitted them. */
  private momentumOf(params: Record<string, any>): number | null {
    const px = params['px'], py = params['py'], pz = params['pz'];
    if (typeof px !== 'number' || typeof py !== 'number' || typeof pz !== 'number') return null;
    return Math.sqrt(px * px + py * py + pz * pz);
  }

  /** The pid-mode color, matching the material choice in createLine2NodeMaterial. */
  private pidColorOf(params: Record<string, any>): number {
    const pdg = typeof params['pdg'] === 'number' ? Math.floor(params['pdg']) : 0;
    const charge = typeof params['charge'] === 'number' ? params['charge'] : 0;
    return pidColorFor(pdg, charge);
  }

  /** Restyle existing lines from the config knobs. Called live on knob changes. */
  override onConfigChanged(): void {
    this.applyStyles();
  }

  /**
   * Applies colorMode/lineWidth/color to all line materials in place —
   * no geometry rebuild, so knob changes are instant even for large events.
   */
  private applyStyles(): void {
    const colorMode = this.config.value<string>('colorMode');
    const lineWidth = this.config.value<number>('lineWidth');
    const solidColor = this.config.value<string>('color');

    if (colorMode === 'momentum' && this.maxMomentum === 0) {
      for (const track of this.trajectories) {
        this.maxMomentum = Math.max(this.maxMomentum, this.momentumOf(track.params) ?? 0);
      }
    }

    const scratch = new Color();
    for (const track of this.trajectories) {
      const material = track.lineObj.material as unknown as Line2NodeMaterial;
      const params = track.params;

      // Optical photons keep their deliberately thin lines
      const isOpticalPhoton = typeof params['pdg'] === 'number' && Math.floor(params['pdg']) === -22;
      material.linewidth = isOpticalPhoton ? Math.min(3, lineWidth) : lineWidth;

      if (colorMode === 'solid') {
        material.color.set(solidColor);
      } else if (colorMode === 'momentum') {
        const momentum = this.momentumOf(params);
        if (momentum === null || this.maxMomentum <= 0) {
          material.color.setHex(NeonTrackColors.Gray);
        } else {
          // Blue (low) -> red (high), linear in |p|
          const fraction = Math.min(1, momentum / this.maxMomentum);
          material.color.copy(scratch.setHSL(0.66 * (1 - fraction), 1, 0.5));
        }
      } else {
        material.color.setHex(this.pidColorOf(params));
      }
      material.needsUpdate = true;

      // A restyle invalidates any pending highlight-restore snapshot
      delete track.lineObj.userData['origColor'];
      delete track.lineObj.userData['origWidth'];
    }
  }

  /**
   * Helper to flatten the [x, y, z, t, ...] points into [x0, y0, z0, x1, y1, z1, ...].
   * We skip anything beyond the first 3 indices in each point array, because
   * x=0,y=1,z=2 are the first three.
   */
  private generateFlatXYZ(points: number[][]): number[] {
    const flat: number[] = [];
    for (let i = 0; i < points.length; i++) {
      flat.push(points[i][0], points[i][1], points[i][2]); // x,y,z
    }
    return flat;
  }

  /**
   * The main Paint method, called each time the user updates "time."
   * If time is null - timeless mode, we show the entire tracks. Otherwise, we show partial up to that time.
   */
  public override paint(time: number | null): void {

    if (time === null) {
      this.paintNoTime();
    } else {
      this.paintAtTime(time);
    }
  }

  private paintNoTime() {
    for (const track of this.trajectories) {
      // Show all points
      track.lineObj.visible = true;
      track.lineObj.geometry.instanceCount = track.points.length - 1;
    }
  }


  /**
   * Improved fastPaint function with proper boundary checking between time points
   * @param time Current simulation time
   */
  public paintAtTime(time: number): void {
    // First pass: categorize tracks as fully visible, partial, or hidden
    const partialTracks: TrajectoryRenderContext[] = [];

    for (const track of this.trajectories) {
      // Hide tracks that haven't started yet
      if (track.startTime > time) {
        track.lineObj.visible = false;
        track.lastPaintIndex = -1;       // if time moves forward, and we start showing track the next time
        continue;
      }

      // Show track
      track.lineObj.visible = true;

      // If track has already ended, show it completely
      if (track.endTime <= time) {
        track.lineObj.geometry.instanceCount = track.points.length - 1;

        // if next paint the time moves backward, and we start hiding track parts,
        // we want lastPaintIndex to correspond to fully rendered track
        track.lastPaintIndex = this.trajectories.length - 1;
        continue;
      }

      // This track is only partially visible and will be treated the next
      partialTracks.push(track);
    }

    // Second pass: handle partially visible tracks
    for (const track of partialTracks) {
      // Validate lastPaintIndex
      if (track.lastPaintIndex < 0 || track.lastPaintIndex >= track.points.length) {
        track.lastPaintIndex = 0;
      }

      // Find the correct interval where the current time falls
      // This is the key improvement: check if we need to move to next/previous point
      // rather than just searching forward or backward arbitrarily

      let needToUpdate = true;
      while (needToUpdate) {
        needToUpdate = false;

        // Check if we should move forward to next point
        if (track.lastPaintIndex < track.points.length - 1 &&
          time >= track.points[track.lastPaintIndex + 1][this.timeColumnIndex]) {
          track.lastPaintIndex++;
          needToUpdate = true;
        }
        // Check if we should move backward to previous point
        else if (track.lastPaintIndex > 0 &&
          time < track.points[track.lastPaintIndex][this.timeColumnIndex]) {
          track.lastPaintIndex--;
          needToUpdate = true;
        }
      }

      // At this point, we've found the correct index where:
      // time is between points[lastPaintIndex] and points[lastPaintIndex+1]
      // Show points up to and including lastPaintIndex
      track.lineObj.geometry.instanceCount = track.lastPaintIndex + 1;
    }
  }

  /**
   * Dispose all line objects, geometry, materials
   */
  public override dispose(): void {
    for (const ld of this.trajectories) {
      const geom = ld.lineObj.geometry as LineGeometry;
      geom.dispose();
      ld.lineMaterial.dispose();

      if (this.parentNode) {
        this.parentNode.remove(ld.lineObj);
      }
    }
    this.trajectories = [];
    super.dispose();
  }

  private getNodeName(trajData: TrajectoryRenderContext, trajCount: number) {

    // Calculate the number of digits needed (order of magnitude + 1)
    const padLength = Math.floor(Math.log10(trajCount)) + 1;

    // Use padStart to pad the string representation with leading zeros
    const indexStr = String(trajData.collectionIndex).padStart(padLength, ' ');


    let name = "track"
    if ("type" in trajData.params) {
      name = trajData.params["type"]
    } else if ("pdg" in trajData.params) {
      name = trajData.params["pdg"]
    } else if ("charge" in trajData.params) {
      const charge = parseFloat(trajData.params["charge"]);
      if (Math.abs(charge) < 0.00001) {
        name = "NeuTrk";
      }
      if (charge > 0) {
        name = "PosTrk";
      } else if (charge < 0) {
        name = "NegTrk";
      }
    }
    name = "[" + name + "]"

    let time = "no-t"
    if (Math.abs(trajData.startTime) > 0.000001 || Math.abs(trajData.endTime) > 0.000001) {
      time = `t:${trajData.startTime.toFixed(1)}-${trajData.endTime.toFixed(1)}`;
    }

    let momentum = "no-p"
    if ("px" in trajData.params && "py" in trajData.params && "pz" in trajData.params) {
      let px = parseFloat(trajData.params["px"]);
      let py = parseFloat(trajData.params["py"]);
      let pz = parseFloat(trajData.params["pz"]);
      momentum = "p:" + (Math.sqrt(px * px + py * py + pz * pz) / 1000.0).toFixed(3);
    }

    return `${indexStr} ${trajData.collectionIndex} ${name} ${momentum} ${time}`;
  }
}
