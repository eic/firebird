
import {Injectable} from '@angular/core';
//import { openFile } from '../../../jsroot/core.mjs';
//import * as ROOT from '../../../jsroot/build;
import {openFile} from 'jsrootdi';
import {
  analyzeGeoNodes,
  editGeoNodes,
  findGeoManager, findGeoNodes, findSingleGeoNode, geoBITS,
  GeoNodeEditRule, printAllGeoBitsStatus,
  PruneRuleActions, removeGeoNode, testGeoBit
} from './utils/cern-root.utils';
import {build} from 'jsrootdi/geom';
import {BehaviorSubject} from "rxjs";
import {RootGeometryProcessor} from "./root-geometry.processor";




@Injectable({
  providedIn: 'root'
})
export class GeometryService {

  rootGeometryProcessor = new RootGeometryProcessor();

  constructor() {
    this.load();
  }

  private stateSubject = new BehaviorSubject<any>(this.load());
  state$ = this.stateSubject.asObservable();

  save(state: any) {
    localStorage.setItem('geometrySettings', JSON.stringify(state));
    this.stateSubject.next(state);
  }

  load(): any {
    const settings = localStorage.getItem('geometrySettings');
    return settings ? JSON.parse(settings) : {
      selectedGeometry: 'epic-central-optimized',
      geoOptEnabled: true,
      selectedGeoCutoff: 'Central detector',
      geoPostEnabled: true
    };
  }

  getState() {
    return this.stateSubject.value;
  }


  async loadEicGeometry() {
    //let url: string = 'assets/epic_pid_only.root';
    //let url: string = 'https://eic.github.io/epic/artifacts/tgeo/epic_dirc_only.root';
    let url: string = 'https://eic.github.io/epic/artifacts/tgeo/epic_full.root';
    // >oO let objectName = 'default';

    console.time('[GeoSrv]: Total load geometry time');
    console.log(`[GeoSrv]: Loading file ${url}`)

    console.time('[GeoSrv]: Open root file');
    const file = await openFile(url);
    // >oO debug console.log(file);
    console.timeEnd('[GeoSrv]: Open root file');


    console.time('[GeoSrv]: Reading geometry from file');
    const rootGeoManager = await findGeoManager(file) // await file.readObject(objectName);
    // >oO console.log(geoManager);
    console.timeEnd('[GeoSrv]: Reading geometry from file');


    console.time('[GeoSrv]: Root geometry pre-processing');
    this.rootGeometryProcessor.process(rootGeoManager);
    console.time('[GeoSrv]: Root geometry pre-processing');

    analyzeGeoNodes(rootGeoManager, 1);

    //
    console.time('[GeoSrv]: Build geometry');
    let rootObject3d = build(rootGeoManager, { numfaces: 500000000, numnodes: 50000000, instancing:1, dflt_colors: false, vislevel: 100, doubleside:true, transparency:true});
    console.timeEnd('[GeoSrv]: Build geometry');
    // >oO console.log(geo);

    console.timeEnd('[GeoSrv]: Total load geometry time');
    return {rootGeoManager, rootObject3d};
  }
}

