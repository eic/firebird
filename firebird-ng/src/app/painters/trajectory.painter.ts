import {EventGroupPainter} from "./event-group-painter";
import {EventGroup} from "../model/event-group";
import {
  PointTrajectoryGroup,
  PointTrajectory
} from "../model/point-trajectory.group";

import {Color, Object3D} from "three";
import {LineMaterial} from "three/examples/jsm/lines/LineMaterial";
import {LineGeometry} from "three/examples/jsm/lines/LineGeometry";
import {Line2} from "three/examples/jsm/lines/Line2";

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
 * We'll keep each line's full data in a small structure so we can rebuild partial geometry.
 */
interface TrajectoryRenderContext {
  collectionIndex: number;           // Index in the array
  lineObj: Line2;                    // the Line2 object in the scene
  points: number[][];                // the raw array of [x, y, z, t, dx, dy, dz, dt]
  lineMaterial: LineMaterial;        // the material used
  startTime: number;                 // The time of the first point
  endTime: number;                   // The end of the last point
  params: Record<string, any>;       // Track parameters
  lastPaintIndex: number;            // This is needed for partial track draw optimization
}

/**
 * Painter that draws lines for a "PointTrajectoryComponent",
 * supporting partial display based on time.
 */
export class TrajectoryPainter extends EventGroupPainter {
  /** A small array to store each line's data and references. */
  public trajectories: TrajectoryRenderContext[] = [];
  private timeColumnIndex = 3;         // TODO check that line has time column

  /** Base materials that we clone for each line. */
  private baseSolidMaterial: LineMaterial;
  private baseDashedMaterial: LineMaterial;

  public readonly trackColorHighlight = 0xff4081; // vivid pink for highlight
  public readonly trackWidthFactor = 2;          // how many times thicker when highlighted

  constructor(parentNode: Object3D, component: EventGroup) {
    super(parentNode, component);

    if (component.type !== PointTrajectoryGroup.type) {
      throw new Error("Wrong component type given to PointTrajectoryPainter.");
    }

    // Create base materials
    this.baseSolidMaterial = new LineMaterial({
      color: 0xffffff,
      linewidth: 10,   // in world units
      worldUnits: true,
      dashed: false,
      alphaToCoverage: true
    });

    this.baseDashedMaterial = new LineMaterial({
      color: 0xffffff,
      linewidth: 10,
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

    const component = this.component as PointTrajectoryGroup;

    // Let us see if paramColumns includes "pdg" or "charge" or something.
    const pdgIndex = component.paramColumns.indexOf("pdg");
    const chargeIndex = component.paramColumns.indexOf("charge");
    let paramsToColumnsMismatchWarned = false;
    let noPointsWarned = 0;


    for (let trajIndex = 0; trajIndex < component.trajectories.length; trajIndex++) {
      const trajectory = component.trajectories[trajIndex];

      // Copy params
      const paramColumns = component.paramColumns;
      const params = trajectory.params;
      if (params.length != paramColumns.length && !paramsToColumnsMismatchWarned) {
        // We do the warning only once!
        console.error(`params.length(${params.length})  != paramColumns.length(${paramColumns.length}) at '${component.name}'. This should never happen!`);
        paramsToColumnsMismatchWarned = true;
      }

      // We intentionally use the very dumb method, but this method allows us to do at least something if they mismatch
      const paramArrLen = Math.min(paramColumns.length, params.length);
      const paramsDict: Record<string, any> = {};
      for (let i = 0; i < paramArrLen; i++) {
        paramsDict[paramColumns[i]] = params[i];
      }

      // Check we have enough points to build at least something!
      if (trajectory.points.length <= 1) {
        if (noPointsWarned < 10) {
          const result = Object.entries(paramsDict)
            .map(([key, value]) => `${key}:${value}`)
            .join(", ");
          console.warn(`Trajectory has ${trajectory.points.length} points. This can't be. Track parameters: ${result}`);
          noPointsWarned++;
        }
        continue;   // Skip this line!
      }

      // Create proper material
      const lineMaterial = this.createLineMaterial(trajectory, pdgIndex, chargeIndex);

      // We'll start by building a geometry with *all* points, and rely on paint() to do partial logic.
      // We'll store the full set of points in linesData, then paint() can rebuild partial geometry.
      const geometry = new LineGeometry();
      const fullPositions = this.generateFlatXYZ(trajectory.points);
      geometry.setPositions(fullPositions);

      const line2 = new Line2(geometry, lineMaterial);
      line2.computeLineDistances();

      // Add to the scene
      this.parentNode.add(line2);

      let startTime = 0;
      let endTime = 0;
      if (trajectory.points[0].length > this.timeColumnIndex) {
        startTime = trajectory.points[0][this.timeColumnIndex];
        endTime = trajectory.points[trajectory.points.length - 1][this.timeColumnIndex]
      }

      const trajData: TrajectoryRenderContext = {
        collectionIndex: trajIndex,
        lineObj: line2,
        lineMaterial: lineMaterial,
        points: trajectory.points,
        startTime: startTime,
        endTime: endTime,
        params: paramsDict,
        lastPaintIndex: 0,
      }

      trajData.lineObj.name = this.getNodeName(trajData, component.trajectories.length);
      trajData.lineObj.userData["track_params"] = trajData.params;

      const this_obj = this;
      const line_obj = trajData.lineObj;

      trajData.lineObj.userData["highlightFunction"] = ()=>{
        // line_obj.material.color.set(this_obj.trackColorHighlight);
        console.log("highlightFunction");
        console.log(this_obj);
        console.log(line_obj);
      };

      trajData.lineObj.userData["unhighlightFunction"] = ()=>{
        // line_obj.material.color.set(this_obj.trackColorHighlight);
        console.log("unhighlightFunction");
        console.log(this_obj);
        console.log(line_obj);
      };


      // Keep the data
      this.trajectories.push(trajData);

    }
  }

  /**
   * Creates or picks a line material based on PDG or charge, etc.
   */
  private createLineMaterial(line: PointTrajectory, pdgIndex: number, chargeIndex: number) {


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
    // ---------- PDG‑specific cases ----------
    switch (pdg) {
      case  22: {                             // γ
        const mat = this.baseDashedMaterial.clone();
        mat.color = new Color(NeonTrackColors.Yellow);
        return mat;
      }
      case -22: {                            // optical photon
        const mat = this.baseSolidMaterial.clone();
        mat.color = new Color(NeonTrackColors.Salad);
        mat.linewidth = 2;
        return mat;
      }
      case  11: {                            // e⁻
        const mat = this.baseSolidMaterial.clone();
        mat.color = new Color(NeonTrackColors.Blue);
        return mat;
      }
      case -11: {                            // e⁺
        const mat = this.baseSolidMaterial.clone();
        mat.color = new Color(NeonTrackColors.Orange);
        return mat;
      }
      case  211: {                           // π⁺
        const mat = this.baseSolidMaterial.clone();
        mat.color = new Color(NeonTrackColors.Pink);
        return mat;
      }
      case -211: {                           // π⁻
        const mat = this.baseSolidMaterial.clone();
        mat.color = new Color(NeonTrackColors.Teal);
        return mat;
      }
      case  2212: {                          // proton
        const mat = this.baseSolidMaterial.clone();
        mat.color = new Color(NeonTrackColors.Violet);
        return mat;
      }
      case  2112: {                          // neutron
        const mat = this.baseDashedMaterial.clone();
        mat.color = new Color(NeonTrackColors.Green);
        return mat;
      }
    }

    // ---------- Fallback by charge ----------
    if (charge > 0) {
      const mat = this.baseSolidMaterial.clone();
      mat.color = new Color(NeonTrackColors.Red);
      return mat;
    }

    if (charge < 0) {
      const mat = this.baseSolidMaterial.clone();
      mat.color = new Color(NeonTrackColors.DeepBlue);
      return mat;
    }

    // Neutral fallback
    const mat = this.baseSolidMaterial.clone();
    mat.color = new Color(NeonTrackColors.Gray);
    return mat;
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
      // Rebuild geometry with *all* points
      track.lineObj.visible = true;
      track.lineObj.geometry.instanceCount = Infinity;
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
        track.lineObj.geometry.instanceCount = Infinity;

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
      const charge = parseFloat(trajData.params["cahrge"]);
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
