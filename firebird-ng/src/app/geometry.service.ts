
import {Injectable} from '@angular/core';
//import { openFile } from '../../../jsroot/core.mjs';
//import * as ROOT from '../../../jsroot/build;
import {openFile} from 'jsrootdi';
import {
  analyzeGeoNodes,
  editGeoNodes,
  findGeoManager, findGeoNodes, findSingleGeoNode, GeoAttBits,
  GeoNodeEditRule, printAllGeoBitsStatus,
  EditActions, removeGeoNode, testGeoBit, getGeoNodesByLevel
} from '../lib-root-geometry/root-geo-navigation';
import {build} from 'jsrootdi/geom';
import {BehaviorSubject} from "rxjs";
import {RootGeometryProcessor} from "./root-geometry.processor";
import {UserConfigService} from "./user-config.service";
import {Subdetector} from "./model/subdetector";
import {Object3D} from "three";

export const GROUP_CALORIMETRY = "Calorimeters";
export const GROUP_TRACKING = "Tracking";
export const GROUP_PID = "PID";
export const GROUP_MAGNETS = "Magnets";
export const GROUP_SUPPORT = "Beam pipe and support";
export const ALL_GROUPS = [
  GROUP_CALORIMETRY,
  GROUP_TRACKING,
  GROUP_PID,
  GROUP_MAGNETS,
  GROUP_SUPPORT,
]

// constants.ts
export const DEFAULT_GEOMETRY = 'epic-central-optimized';

@Injectable({
  providedIn: 'root'
})
export class GeometryService {

  public rootGeometryProcessor = new RootGeometryProcessor();

  /** Collection of subdetectors */
  public subdetectors: Subdetector[] = [];

  /** TGeoManager if available */
  public rootGeometry: any|null = null;

  /** Main/entry/root THREEJS geometry tree node with the whole geometry */
  public geometry: Object3D|null = null;

  public groupsByDetName: Map<string, string>;

  constructor(private settings: UserConfigService) {
    this.groupsByDetName = new Map<string,string> ([
      ["SolenoidBarrel_assembly_0", GROUP_MAGNETS],
      ["SolenoidEndcapP_1", GROUP_MAGNETS],
      ["SolenoidEndcapN_2", GROUP_MAGNETS],
      ["VertexBarrelSubAssembly_3", GROUP_TRACKING],
      ["InnerSiTrackerSubAssembly_4", GROUP_TRACKING],
      ["MiddleSiTrackerSubAssembly_5", GROUP_TRACKING],
      ["OuterSiTrackerSubAssembly_6", GROUP_TRACKING],
      ["EndcapMPGDSubAssembly_7", GROUP_TRACKING],
      ["InnerMPGDBarrelSubAssembly_8", GROUP_TRACKING],
      ["EndcapTOFSubAssembly_9", GROUP_PID],
      ["BarrelTOFSubAssembly_10", GROUP_PID],
      ["OuterBarrelMPGDSubAssembly_11", GROUP_TRACKING],
      ["B0TrackerSubAssembly_12", GROUP_TRACKING],
      ["InnerTrackerSupport_assembly_13", GROUP_SUPPORT],
      ["DIRC_14", GROUP_PID],
      ["RICHEndcapN_Vol_15", GROUP_PID],
      ["DRICH_16", GROUP_PID],
      ["EcalEndcapP_17", GROUP_CALORIMETRY],
      ["EcalEndcapPInsert_18", GROUP_CALORIMETRY],
      ["EcalBarrelImaging_19", GROUP_CALORIMETRY],
      ["EcalBarrelScFi_20", GROUP_CALORIMETRY],
      ["EcalEndcapN_21", GROUP_CALORIMETRY],
      ["LFHCAL_env_22", GROUP_CALORIMETRY],
      ["HcalEndcapPInsert_23", GROUP_CALORIMETRY],
      ["HcalBarrel_24", GROUP_CALORIMETRY],
      ["FluxBarrel_env_25", GROUP_SUPPORT],
      ["FluxEndcapP_26", GROUP_SUPPORT],
      ["HcalEndcapN_27", GROUP_CALORIMETRY],
      ["FluxEndcapN_28", GROUP_SUPPORT],
      ["BeamPipe_assembly_29", GROUP_SUPPORT],
      ["B0PF_BeamlineMagnet_assembly_30", GROUP_MAGNETS],
      ["B0APF_BeamlineMagnet_assembly_31", GROUP_MAGNETS],
      ["Q1APF_BeamlineMagnet_assembly_32", GROUP_MAGNETS],
      ["Q1BPF_BeamlineMagnet_assembly_33", GROUP_MAGNETS],
      ["BeamPipeB0_assembly_38", GROUP_SUPPORT],
      ["Pipe_cen_to_pos_assembly_39", GROUP_SUPPORT],
      ["Q0EF_assembly_40", GROUP_MAGNETS],
      ["Q0EF_vac_41", GROUP_MAGNETS],
      ["Q1EF_assembly_42", GROUP_MAGNETS],
      ["Q1EF_vac_43", GROUP_MAGNETS],
      ["B0ECal_44", GROUP_CALORIMETRY],
      ["Pipe_Q1eR_to_B2BeR_assembly_54", GROUP_SUPPORT],
      ["Magnet_Q1eR_assembly_55", GROUP_MAGNETS],
      ["Magnet_Q2eR_assembly_56", GROUP_MAGNETS],
      ["Magnet_B2AeR_assembly_57", GROUP_MAGNETS],
      ["Magnet_B2BeR_assembly_58", GROUP_MAGNETS],
      ["Magnets_Q3eR_assembly_59", GROUP_MAGNETS],
    ])

  }


  async loadGeometry(): Promise<{rootGeometry: any|null, threeGeometry: Object3D|null}> {

    this.subdetectors = [];
    //let url: string = 'assets/epic_pid_only.root';
    //let url: string = 'https://eic.github.io/epic/artifacts/tgeo/epic_dirc_only.root';
    // let url: string = 'https://eic.github.io/epic/artifacts/tgeo/epic_full.root';
    // >oO let objectName = 'default';

    const url = this.settings.selectedGeometry.value !== DEFAULT_GEOMETRY?
      this.settings.selectedGeometry.value:
      'https://eic.github.io/epic/artifacts/tgeo/epic_full.root';

    console.time('[GeometryService]: Total load geometry time');
    console.log(`[GeometryService]: Loading file ${url}`)

    console.time('[GeometryService]: Open root file');
    const file = await openFile(url);
    // >oO debug console.log(file);
    console.timeEnd('[GeometryService]: Open root file');


    console.time('[GeometryService]: Reading geometry from file');
    this.rootGeometry = await findGeoManager(file) // await file.readObject(objectName);
    // >oO
    console.log("Got TGeoManager. For inspection:")
    console.log(this.rootGeometry);
    console.timeEnd('[GeometryService]: Reading geometry from file');


    console.time('[GeometryService]: Root geometry pre-processing');
    this.rootGeometryProcessor.process(this.rootGeometry);
    console.time('[GeometryService]: Root geometry pre-processing');

    analyzeGeoNodes(this.rootGeometry, 1);

    //
    console.time('[GeometryService]: Build geometry');
    this.geometry = build(this.rootGeometry,
      {
        numfaces: 5000000000,
        numnodes: 5000000000,
        instancing:-1,
        dflt_colors: false,
        vislevel: 200,
        doubleside:true,
        transparency:true
      });
    console.timeEnd('[GeometryService]: Build geometry');

    // Validate the geometry
    if(!this.geometry) {
      throw new Error("Geometry is null or undefined after TGeoPainter.build");
    }

    if(!this.geometry.children.length) {
      throw new Error("Geometry is converted but empty. Anticipated 'world_volume' but got nothing");
    }

    if(!this.geometry.children[0].children.length) {
      throw new Error("Geometry is converted but empty. Anticipated array of top level nodes (usually subdetectors) but got nothing");
    }

    // We now know it is not empty array
    console.time('[GeometryService]: Map root geometry to threejs geometry');
    let topDetectorNodes = this.geometry.children[0].children;
    for(const topNode of topDetectorNodes) {

      // Process name
      const originalName = topNode.name;
      const name = this.stripIdFromName(originalName);   // Remove id in the end EcalN_21 => Ecal

      const rootGeoNodes = getGeoNodesByLevel(this.rootGeometry, 1).map(obj=>obj.geoNode);
      const rootNode = rootGeoNodes.find(obj => obj.fName === originalName);

      let subdetector: Subdetector = {
        sourceGeometry: rootNode,
        sourceGeometryName: rootNode?.fName ?? "",
        geometry: topNode,
        name: this.stripIdFromName(originalName),
        groupName: this.groupsByDetName.get(originalName) || ""
      }
      console.log(subdetector.sourceGeometryName);
      this.subdetectors.push(subdetector);
    }
    console.timeEnd('[GeometryService]: Map root geometry to threejs geometry');


    console.timeEnd('[GeometryService]: Total load geometry time');
    return {rootGeometry: this.rootGeometry, threeGeometry: this.geometry};
  }

  private stripIdFromName(name: string) {
      return name.replace(/_\d+$/, '');
  }
}

