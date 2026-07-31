import {Object3D, Vector3} from "three";
import {Line2NodeMaterial} from "three/webgpu";
import {LineGeometry} from "three/examples/jsm/lines/LineGeometry.js";
import {Line2} from "three/examples/jsm/lines/webgpu/Line2.js";


export interface ProcessTrackInfo {
  positions: [[number]];
  trackNode: Object3D;
  oldLine: Object3D;
  newLine: Line2;
  trackMesh: Object3D;
  startTime: number;
  endTime: number;
}

export enum NeonTrackColors {

  Red = 0xFF0007,
  Pink= 0xCF00FF,
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
 *     "gamma": "yellow",
 *     "e-": "blue",
 *     "pi+": "pink",
 *     "pi-": "salad",
 *     "proton": "violet",
 *     "neutron": "green"
 */
export class StepTrackComponentPainter {

  private readonly defaultLineWidth = 40;

  /**
   * Creates a new solid Line2NodeMaterial.
   * NOTE: We create fresh materials instead of using .clone() because
   * Line2NodeMaterial.clone() in three.js v0.183 does NOT copy _useWorldUnits,
   * _useDash, or linewidth, causing all cloned materials to have 1px lines.
   */
  private newSolid(color: NeonTrackColors, linewidth?: number): Line2NodeMaterial {
    return new Line2NodeMaterial({
      color: color,
      linewidth: linewidth ?? this.defaultLineWidth,
      worldUnits: true,
      dashed: false,
      alphaToCoverage: true,
    });
  }

  private newDashed(color: NeonTrackColors, opts?: { linewidth?: number; dashSize?: number; gapSize?: number }): Line2NodeMaterial {
    return new Line2NodeMaterial({
      color: color,
      linewidth: opts?.linewidth ?? this.defaultLineWidth,
      worldUnits: true,
      dashed: true,
      dashSize: opts?.dashSize ?? 100,
      gapSize: opts?.gapSize ?? 100,
      alphaToCoverage: true,
    });
  }

  gammaMaterial: Line2NodeMaterial;
  opticalMaterial: Line2NodeMaterial;
  electronMaterial: Line2NodeMaterial;
  piPlusMaterial: Line2NodeMaterial;
  piMinusMaterial: Line2NodeMaterial;
  piZeroMaterial: Line2NodeMaterial;
  protonMaterial: Line2NodeMaterial;
  neutronMaterial: Line2NodeMaterial;
  posChargeMaterial: Line2NodeMaterial;
  negChargeMaterial: Line2NodeMaterial;
  zeroChargeMaterial: Line2NodeMaterial;
  scatteredElectronMaterial: Line2NodeMaterial;

  constructor() {
    this.gammaMaterial = this.newDashed(NeonTrackColors.Yellow, { dashSize: 50, gapSize: 50 });
    this.opticalMaterial = this.newDashed(NeonTrackColors.Salad, { linewidth: 10 });
    this.electronMaterial = this.newSolid(NeonTrackColors.Blue);
    this.scatteredElectronMaterial = this.newSolid(NeonTrackColors.Blue, 30);
    this.piPlusMaterial = this.newSolid(NeonTrackColors.Pink);
    this.piMinusMaterial = this.newSolid(NeonTrackColors.Teal);
    this.piZeroMaterial = this.newDashed(NeonTrackColors.Salad);
    this.protonMaterial = this.newSolid(NeonTrackColors.Violet);
    this.neutronMaterial = this.newDashed(NeonTrackColors.Green);
    this.posChargeMaterial = this.newSolid(NeonTrackColors.Red);
    this.negChargeMaterial = this.newSolid(NeonTrackColors.DeepBlue);
    this.zeroChargeMaterial = this.newDashed(NeonTrackColors.Gray);
  }

  getMaterial(pdgName: string, charge: number): Line2NodeMaterial {
    switch (pdgName) {
      case "gamma":
        return this.gammaMaterial;
      case "opticalphoton":
        return this.opticalMaterial;
      case "e-":
        return this.electronMaterial;
      case "pi+":
        return this.piPlusMaterial;
      case "pi-":
        return this.piMinusMaterial;
      case "pi0":
        return this.piZeroMaterial;
      case "proton":
        return this.protonMaterial;
      case "neutron":
        return this.neutronMaterial;
      default:
        return charge < 0 ? this.negChargeMaterial: (charge > 0? this.posChargeMaterial: this.neutronMaterial); // Fallback function if material is not predefined
    }
  }

  processMcTracks(mcTracksGroup: Object3D) {

    let isFoundScatteredElectron = false;
    let processedTrackGroups: ProcessTrackInfo[] = [];
    for(let trackGroup of mcTracksGroup.children) {

      let trackData = trackGroup.userData;
      if(!('pdg_name' in trackData)) continue;
      if(!('charge' in trackData)) continue;
      if(!('pos' in trackData)) continue;
      const pdgName = trackData["pdg_name"] as string;
      const charge = trackData["charge"] as number;
      const id = trackData["id"]
      let positions = trackData["pos"];

      // If we are here this is
      let trackNode: Object3D = trackGroup;
      let oldLine: Object3D|null = null;
      let newLine: Line2|null = null;
      let trackMesh: Object3D|null = null;
      let timeStart = 0;
      let timeEnd = 0;
      let startPoint = new Vector3();
      let endPoint = new Vector3();

      for(let obj of trackGroup.children) {

        if(obj.type == "Line") {

          // Do we have time info?
          if(positions.length > 0 && positions[0].length > 3) {
            let position = positions[0]
            timeStart = timeEnd = position[3];
            startPoint = endPoint = new Vector3(position[0], position[1], position[2]);
          }
          // Set end time if there is more than 1 point
          if(positions.length > 1 && positions[0].length > 3) {
            let position = positions[positions.length-1];
            timeEnd = position[3];
            endPoint = new Vector3(position[0], position[1], position[2]);
          }

          // Build our flat points array and set geometry
          let flat = [];
          for(let position of positions) {
            flat.push(position[0], position[1], position[2]);
          }
          const geometry = new LineGeometry();
          geometry.setPositions( flat );
          // geometry.setColors( colors );

          let material = this.getMaterial(pdgName, charge);
          if(!isFoundScatteredElectron && pdgName=="e-") {
            isFoundScatteredElectron = true;
            material = this.scatteredElectronMaterial;
          }

          let line = new Line2( geometry, material as any );

          // line.scale.set( 1, 1, 1 );
          line.name = "TrackLine2";
          line.computeLineDistances();
          line.visible = true;
          trackGroup.add( line );
          obj.visible = false;
          oldLine = obj;
          newLine = line;
          let ic = (line.geometry as any)?.attributes?.instanceStart;
          let geomCount = (line.geometry as any).count;

          let posLen = positions.length;
          //oldLine.removeFromParent();

          // console.log(`id: ${id} pdg: ${pdgName} tstart: ${timeStart.toFixed(2)} tend: ${timeEnd.toFixed(2)} instCount: ${ic?.data?.array?.length} count: ${geomCount} posLen: ${posLen} length: ${endPoint.distanceTo(startPoint)}`);
          // console.log(ic);
        }

        if(obj.type == "Mesh") {
          obj.visible = false;
          trackMesh = obj;
          // obj.removeFromParent();
        }
      }

      // We found everything
      if(oldLine && newLine && trackMesh) {
        processedTrackGroups.push({
          positions: positions,
          trackNode: trackNode,
          oldLine: oldLine,
          newLine: newLine,
          trackMesh: trackMesh,
          startTime: timeStart,
          endTime: timeEnd,
        })
      }
    }

    console.log(`Total processed tracks: ${processedTrackGroups.length}`);
    return processedTrackGroups;
  }
}
