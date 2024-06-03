
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
} from './utils/cern-root.utils';
import {build} from 'jsrootdi/geom';
import {BehaviorSubject} from "rxjs";
import {RootGeometryProcessor} from "./root-geometry.processor";
import {UserConfigService} from "./user-config.service";
import {Subdetector} from "./model/subdetector";
import {Object3D} from "three";

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
      ["hello", "world"]
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
        numfaces: 500000000,
        numnodes: 500000000,
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
        groupName: this.groupsByDetName.get(name) || ""
      }
      console.log(subdetector.name, subdetector);
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

