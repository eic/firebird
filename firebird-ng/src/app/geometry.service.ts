import { Injectable } from '@angular/core';
import { openFile } from 'jsroot';
import {
  analyzeGeoNodes,
  editGeoNodes,
  findGeoManager, findGeoNodes,
  GeoNodeEditRule,
  PruneRuleActions
} from './utils/cern-root.utils';
import { build } from 'jsroot/geom';


@Injectable({
  providedIn: 'root'
})
export class GeometryService {

  /**
   * Simple to fill list of patterns of elements to drop
   * @typedef {Array.<string>} FullGeometryPruneList
   */
  fullGeometryPruneList: string[];

  /// This inted to become users rule
  fineTuneRules: GeoNodeEditRule[];
  totalRules: GeoNodeEditRule[] = [];


  constructor() {
    this.fullGeometryPruneList = [
      "Default/DIRC_??",
      "Default/Lumi*",
      "Default/Magnet*",
      "Default/B0*",
      "Default/B1*",
      "Default/B2*",
      "Default/Q0*",
      "Default/Q1*",
      "Default/Q2*",
      "Default/BeamPipe*",
      "Default/Pipe*",
      "Default/ForwardOffM*",
      "Default/Forward*",
      "Default/Backward*",
      "Default/Vacuum*",
      "Default/DRICH*",
      "*ZDC*",
      "*AstroPix_Module_*",
      "Default/Ecal*/fiber_grid*",
    ];

    this.fineTuneRules = [
      {pattern: "Default/EcalBarrel*/sector*", prune: PruneRuleActions.RemoveDaughters}

    ]

    // Fill rules with prune
    for(let pattern of this.fullGeometryPruneList) {
      this.totalRules.push({ pattern, prune: PruneRuleActions.Remove });
    }

    // Copy users rules
    for(let rule of this.fineTuneRules) {
      this.totalRules.push(rule);
    }


  }

  async loadGeometry(url: string, rules: object): Promise<any> {
    //let url: string = 'assets/epic_pid_only.root';
    //let url: string = 'https://eic.github.io/epic/artifacts/tgeo/epic_dirc_only.root';

    let objectName = 'default';

    console.log(`Loading file ${url}`)

    console.time('Open root file');
    const file = await openFile(url);
    // >oO debug console.log(file);
    console.timeEnd('Open root file');


    console.time('Reading geometry from file');
    const geoManager = await findGeoManager(file) // await file.readObject(objectName);
    // >oO console.log(geoManager);
    console.timeEnd('Reading geometry from file');


    //
    // console.time('Go over all nodes');
    // //this.printVolumeRecursive(obj, 10);
    // //this.printNodeRecursive(obj.fNodes.arr[0], 2);
    // console.timeEnd('Go over all nodes');
    //
    //
    console.time('Build geometry');
    let geo = build(geoManager, { numfaces: 500000000, numnodes: 5000000, dflt_colors: false, vislevel: 10, doubleside:true, transparency:false});
    console.timeEnd('Build geometry');
    console.log(geo);
    //
    console.time('Convert to JSon geometry')
    let json = geo.toJSON();
    console.timeEnd('Convert to JSon geometry')
    console.log(json);
    // return json;
    return json;
    return "";
  }

  async loadEicGeometry() {
    //let url: string = 'assets/epic_pid_only.root';
    //let url: string = 'https://eic.github.io/epic/artifacts/tgeo/epic_dirc_only.root';
    let url: string = 'https://eic.github.io/epic/artifacts/tgeo/epic_full.root';
    // >oO let objectName = 'default';

    console.log(`Loading file ${url}`)

    console.time('Open root file');
    const file = await openFile(url);
    // >oO debug console.log(file);
    console.timeEnd('Open root file');


    console.time('Reading geometry from file');
    const geoManager = await findGeoManager(file) // await file.readObject(objectName);
    // >oO console.log(geoManager);
    console.timeEnd('Reading geometry from file');

    //
    analyzeGeoNodes(geoManager, 1);
    console.time('Prune nodes coarse');
    editGeoNodes(geoManager, this.totalRules, 1)
    console.timeEnd('Prune nodes coarse');

    // >oO analyzeGeoNodes(geoManager, 1);

    // console.time('Prune nodes fine');
    // editGeoNodes(geoManager, this.totalRules, 15)
    // console.timeEnd('Prune nodes fine');

    analyzeGeoNodes(geoManager, 1);

    //
    console.time('Build geometry');
    let geo = build(geoManager, { numfaces: 500000000, numnodes: 5000000, dflt_colors: false, vislevel: 3, doubleside:true, transparency:false});
    console.timeEnd('Build geometry');
    // >oO console.log(geo);

    console.time('Convert to JSon geometry')
    let json = geo.toJSON();
    console.timeEnd('Convert to JSon geometry')
    // >oO console.log(json);

    return json;

  }
}

