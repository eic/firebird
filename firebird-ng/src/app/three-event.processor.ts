import {Color, Object3D} from "three";
import {LineMaterial} from "three/examples/jsm/lines/LineMaterial";
import {LineGeometry} from "three/examples/jsm/lines/LineGeometry";
import {Line2} from "three/examples/jsm/lines/Line2";


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
export class ThreeEventProcessor {

  /** This is primer, all other DASHED line materials take this and clone and change color */
  dashedLineMaterial = new LineMaterial( {
    color: 0xffff00,
    linewidth: 10, // in world units with size attenuation, pixels otherwise
    worldUnits: true,
    dashed: true,
    //dashScale: 100,     // ???? Need this? What is it?
    dashSize: 100,
    gapSize: 100,
    alphaToCoverage: true,
  } );

  /** This is primer, all other SOLID line materials take this and clone and change color */
  solidLineMaterial = new LineMaterial( {
    color: 0xffff00,
    linewidth: 10, // in world units with size attenuation, pixels otherwise
    worldUnits: true,
    dashed: false,
    //dashScale: 100,     // ???? Need this? What is it?
    alphaToCoverage: true,
  } );

  gammaMaterial: LineMaterial;
  electronMaterial: LineMaterial;
  piPlusMaterial: LineMaterial;
  piMinusMaterial: LineMaterial;
  piZeroMaterial: LineMaterial;
  protonMaterial: LineMaterial;
  neutronMaterial: LineMaterial;
  posChargeMaterial: LineMaterial;
  negChargeMaterial: LineMaterial;
  zeroChargeMaterial: LineMaterial;
  scatteredElectronMaterial: LineMaterial;

  constructor() {
    this.gammaMaterial = this.dashedLineMaterial.clone();
    this.gammaMaterial.color = new Color(NeonTrackColors.Yellow);
    this.gammaMaterial.dashSize = 50;
    this.gammaMaterial.gapSize = 50;

    this.electronMaterial = this.solidLineMaterial.clone();
    this.electronMaterial.color = new Color(NeonTrackColors.Blue);

    this.scatteredElectronMaterial = this.electronMaterial.clone();
    this.scatteredElectronMaterial.linewidth = 30;

    this.piPlusMaterial = this.solidLineMaterial.clone();
    this.piPlusMaterial.color = new Color(NeonTrackColors.Pink);

    this.piMinusMaterial = this.solidLineMaterial.clone();
    this.piMinusMaterial.color = new Color(NeonTrackColors.Teal);

    this.piZeroMaterial = this.dashedLineMaterial.clone();
    this.piZeroMaterial.color = new Color(NeonTrackColors.Salad);

    this.protonMaterial = this.solidLineMaterial.clone();
    this.protonMaterial.color = new Color(NeonTrackColors.Violet);

    this.neutronMaterial = this.dashedLineMaterial.clone();
    this.neutronMaterial.color = new Color(NeonTrackColors.Green);

    this.posChargeMaterial = this.solidLineMaterial.clone();
    this.posChargeMaterial.color = new Color(NeonTrackColors.Red);

    this.negChargeMaterial = this.solidLineMaterial.clone();
    this.negChargeMaterial.color = new Color(NeonTrackColors.DeepBlue);

    this.zeroChargeMaterial = this.dashedLineMaterial.clone();
    this.zeroChargeMaterial.color = new Color(NeonTrackColors.Gray);

  }

  getMaterial(pdgName: string, charge: number): LineMaterial {
    switch (pdgName) {
      case "gamma":
        return this.gammaMaterial;
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
      for(let trackGroup of mcTracksGroup.children) {

        let trackData = trackGroup.userData;
        if(!('pdg_name' in trackData)) continue;
        if(!('charge' in trackData)) continue;
        const pdgName = trackData["pdg_name"] as string;
        const charge = trackData["charge"] as number;

        for(let obj of trackGroup.children) {
          if(obj.type == "Line") {

            let positions = (obj.userData as any).pos;

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

            let line = new Line2( geometry, material );

            // line.scale.set( 1, 1, 1 );
            line.computeLineDistances();
            line.visible = true;
            trackGroup.add( line );
            obj.visible = false;
          }

          if(obj.type == "Mesh") {
            obj.visible = false;
          }
        }

      }

    }



}
