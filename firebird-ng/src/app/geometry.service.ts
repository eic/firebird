
import {Injectable} from '@angular/core';
//import { openFile } from '../../../jsroot/core.mjs';
//import * as ROOT from '../../../jsroot/build;
import {openFile} from 'jsrootdi';
import {
  analyzeGeoNodes,
  editGeoNodes,
  findGeoManager, findGeoNodes, findSingleGeoNode, GeoAttBits,
  GeoNodeEditRule, printAllGeoBitsStatus,
  EditActions, removeGeoNode, testGeoBit
} from './utils/cern-root.utils';
import {build} from 'jsrootdi/geom';
import {BehaviorSubject} from "rxjs";
import {RootGeometryProcessor} from "./root-geometry.processor";
import {UserConfigService} from "./user-config.service";

// constants.ts
export const DEFAULT_GEOMETRY = 'epic-central-optimized';

@Injectable({
  providedIn: 'root'
})
export class GeometryService {

  rootGeometryProcessor = new RootGeometryProcessor();

  constructor(private settings: UserConfigService) {

  }


  async loadGeometry() {
    //let url: string = 'assets/epic_pid_only.root';
    //let url: string = 'https://eic.github.io/epic/artifacts/tgeo/epic_dirc_only.root';
    // let url: string = 'https://eic.github.io/epic/artifacts/tgeo/epic_full.root';
    // >oO let objectName = 'default';

    const url = this.settings.selectedGeometry.value !== DEFAULT_GEOMETRY?
      this.settings.selectedGeometry.value:
      'https://eic.github.io/epic/artifacts/tgeo/epic_full.root';

    console.time('[GeoSrv]: Total load geometry time');
    console.log(`[GeoSrv]: Loading file ${url}`)

    console.time('[GeoSrv]: Open root file');
    const file = await openFile(url);
    // >oO debug console.log(file);
    console.timeEnd('[GeoSrv]: Open root file');


    console.time('[GeoSrv]: Reading geometry from file');
    const rootGeoManager = await findGeoManager(file) // await file.readObject(objectName);
    // >oO
    console.log(rootGeoManager);
    console.timeEnd('[GeoSrv]: Reading geometry from file');


    console.time('[GeoSrv]: Root geometry pre-processing');
    this.rootGeometryProcessor.process(rootGeoManager);
    console.time('[GeoSrv]: Root geometry pre-processing');

    analyzeGeoNodes(rootGeoManager, 1);

    //
    console.time('[GeoSrv]: Build geometry');
    let rootObject3d = build(rootGeoManager, { numfaces: 500000000, numnodes: 50000000, instancing:-1, dflt_colors: false, vislevel: 100, doubleside:true, transparency:true});
    console.timeEnd('[GeoSrv]: Build geometry');
    // >oO console.log(geo);

    console.timeEnd('[GeoSrv]: Total load geometry time');
    return {rootGeoManager, rootObject3d};
  }
}

