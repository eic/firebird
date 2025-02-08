import { ComponentPainter } from "./component-painter";
import { EntryComponent } from "../model/entry-component";
import {
  PointTrajectoryComponent,
  TrackerLineSegment
} from "../model/point-trajectory.event-component";

import { Color, Object3D } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { Line2 } from "three/examples/jsm/lines/Line2";

/** Example color set. Feel free to refine or expand. */
export enum NeonTrackColors {
  Red      = 0xFF0007,
  Pink     = 0xCF00FF,
  Violet   = 0x5400FF,
  Blue     = 0x0097FF,
  DeepBlue = 0x003BFF,
  Teal     = 0x00FFD1,
  Green    = 0x13FF00,
  Salad    = 0x8CFF00,
  Yellow   = 0xFFEE00,
  Orange   = 0xFF3500,
  Gray     = 0xAAAAAA,
}

/**
 * We'll keep each line's full data in a small structure so we can rebuild partial geometry.
 */
interface InternalLineData {
  lineObj: Line2;                // the Line2 object in the scene
  points: number[][];            // the raw array of [x, y, z, t, dx, dy, dz, dt]
  lineMaterial: LineMaterial;    // the material used
}

/**
 * Painter that draws lines for a "TrackerLinePointTrajectoryComponent",
 * supporting partial display based on time.
 */
export class PointTrajectoryPainter extends ComponentPainter {
  /** A small array to store each line's data and references. */
  private linesData: InternalLineData[] = [];

  /** Base materials that we clone for each line. */
  private baseSolidMaterial: LineMaterial;
  private baseDashedMaterial: LineMaterial;

  constructor(parentNode: Object3D, component: EntryComponent) {
    super(parentNode, component);

    if (component.type !== PointTrajectoryComponent.type) {
      throw new Error("Wrong component type given to TrackerLinePointTrajectoryPainter.");
    }

    // Create base materials
    this.baseSolidMaterial = new LineMaterial({
      color: 0xffffff,
      linewidth: 20,   // in world units
      worldUnits: true,
      dashed: false,
      alphaToCoverage: true
    });

    this.baseDashedMaterial = new LineMaterial({
      color: 0xffffff,
      linewidth: 20,
      worldUnits: true,
      dashed: true,
      dashSize: 100,
      gapSize: 100,
      alphaToCoverage: true
    });

    // Build lines at construction
    this.initLines();
  }

  /**
   * Builds the Line2 objects for each line in the data.
   * Initially, we set them fully visible (or we could set them invisible).
   */
  private initLines() {
    const comp = this.component as PointTrajectoryComponent;

    // Let us see if paramColumns includes "pdg" or "charge" or something.
    const pdgIndex = comp.paramColumns.indexOf("pdg");
    const chargeIndex = comp.paramColumns.indexOf("charge");

    for (const lineSegment of comp.lines) {
      const { lineMaterial } = this.createLineMaterial(lineSegment, pdgIndex, chargeIndex);

      // We'll start by building a geometry with *all* points, or we can build empty geometry
      // and rely on paint() to do partial logic. For simplicity, let's build full geometry now.
      // We'll store the full set of points in linesData, then paint() can rebuild partial geometry.

      const geometry = new LineGeometry();
      const fullPositions = this.generateFlatXYZ(lineSegment.points);
      geometry.setPositions(fullPositions);

      const line2 = new Line2(geometry, lineMaterial);
      line2.computeLineDistances();

      // Add to the scene
      this.parentNode.add(line2);

      // Keep the data
      this.linesData.push({
        lineObj: line2,
        points: lineSegment.points,
        lineMaterial
      });
    }
  }

  /**
   * Creates or picks a line material based on PDG or charge, etc.
   */
  private createLineMaterial(line: TrackerLineSegment, pdgIndex: number, chargeIndex: number) {
    let colorVal = NeonTrackColors.Gray;
    let dashed = false;

    // Try to read PDG and/or charge from line.params
    // This assumes line.params matches paramColumns.
    let pdg = 0, charge = 0;
    if (pdgIndex >= 0 && pdgIndex < line.params.length) {
      pdg = Math.floor(line.params[pdgIndex]);
    }
    if (chargeIndex >= 0 && chargeIndex < line.params.length) {
      charge = line.params[chargeIndex];
    }

    // Minimal PDG-based color logic
    switch (pdg) {
      case 22: // gamma
        colorVal = NeonTrackColors.Yellow;
        dashed = true;
        break;
      case 11: // e-
        colorVal = NeonTrackColors.Blue;
        dashed = false;
        break;
      case -11: // e+
        colorVal = NeonTrackColors.Red;
        dashed = false;
        break;
      case 211: // pi+
        colorVal = NeonTrackColors.Pink;
        dashed = false;
        break;
      case -211: // pi-
        colorVal = NeonTrackColors.Teal;
        dashed = false;
        break;
      case 2212: // proton
        colorVal = NeonTrackColors.Violet;
        dashed = false;
        break;
      case 2112: // neutron
        colorVal = NeonTrackColors.Green;
        dashed = true;
        break;
      default:
        // fallback by charge
        if (charge > 0) colorVal = NeonTrackColors.Red;
        else if (charge < 0) colorVal = NeonTrackColors.DeepBlue;
        else colorVal = NeonTrackColors.Gray;
        break;
    }

    // clone base material
    const mat = dashed ? this.baseDashedMaterial.clone() : this.baseSolidMaterial.clone();
    mat.color = new Color(colorVal);

    return { lineMaterial: mat, dashed };
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
   * Rebuild partial geometry for a line up to time `t`.
   * If the user wants interpolation, we do that for the "one extra" point beyond t.
   * Otherwise, we just up to the last point with time <= t.
   */
  private buildPartialXYZ(points: number[][], t: number): number[] {
    const flat: number[] = [];

    // We assume each "points[i]" = [x, y, z, time, dx, dy, dz, dt].
    // The time is at index 3 if it exists.
    const TIME_INDEX = 3;
    if (!points.length) return flat;

    let lastGoodIndex = -1;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.length > TIME_INDEX) {
        if (p[TIME_INDEX] <= t) {
          // This entire point is included
          flat.push(p[0], p[1], p[2]);
          lastGoodIndex = i;
        } else {
          // we've found a point beyond t, let's see if we want to interpolate
          if (lastGoodIndex >= 0) {
            // Interpolate between points[lastGoodIndex] and points[i]
            const p0 = points[lastGoodIndex];
            const t0 = p0[TIME_INDEX];
            const t1 = p[TIME_INDEX];
            if (Math.abs(t1 - t0) > 1e-9) {
              const frac = (t - t0) / (t1 - t0);
              const xInterp = p0[0] + frac * (p[0] - p0[0]);
              const yInterp = p0[1] + frac * (p[1] - p0[1]);
              const zInterp = p0[2] + frac * (p[2] - p0[2]);
              flat.push(xInterp, yInterp, zInterp);
            } else {
              // times are effectively the same
              flat.push(p0[0], p0[1], p0[2]);
            }
          }
          break; // stop scanning
        }
      } else {
        // If there's no time column for that point, let's assume 0 or treat as instant
        // For simplicity, let's treat time as 0. So if t>0, we include it.
        flat.push(p[0], p[1], p[2]);
        lastGoodIndex = i;
      }
    }
    return flat;
  }

  /**
   * The main painting method, called each time the user updates "time."
   * If time is null, we show the entire track. Otherwise, we show partial up to that time.
   */
  public override paint(time: number | null): void {
    // If time===null => show all lines fully
    if (time === null) {
      for (const ld of this.linesData) {
        // Rebuild geometry with *all* points
        const fullPositions = this.generateFlatXYZ(ld.points);
        const geom = ld.lineObj.geometry as LineGeometry;
        // Dispose old geometry
        geom.dispose();
        // Build new
        geom.setPositions(fullPositions);
        ld.lineObj.computeLineDistances();
        ld.lineObj.visible = true;
      }
      return;
    }

    // Otherwise, partial or none
    for (const ld of this.linesData) {
      // Rebuild geometry up to time
      const partialPositions = this.buildPartialXYZ(ld.points, time);
      if (partialPositions.length < 2 * 3) {
        // fewer than 2 points => hide
        ld.lineObj.visible = false;
        continue;
      }
      ld.lineObj.visible = true;

      // Dispose old geometry
      const geom = ld.lineObj.geometry as LineGeometry;
      geom.dispose();

      // Set new geometry
      geom.setPositions(partialPositions);
      ld.lineObj.computeLineDistances();
    }
  }

  /**
   * Dispose all line objects, geometry, materials
   */
  public override dispose(): void {
    for (const ld of this.linesData) {
      const geom = ld.lineObj.geometry as LineGeometry;
      geom.dispose();
      ld.lineMaterial.dispose();

      if (this.parentNode) {
        this.parentNode.remove(ld.lineObj);
      }
    }
    this.linesData = [];
    super.dispose();
  }
}
