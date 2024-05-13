import {Injectable} from '@angular/core';
//import { openFile } from '../../../jsroot/core.mjs';
//import * as ROOT from '../../../jsroot/build;
import {openFile} from 'jsrootdi';
import {
  analyzeGeoNodes,
  editGeoNodes,
  findGeoManager, findGeoNodes, findSingleGeoNode,
  GeoNodeEditRule,
  PruneRuleActions, removeGeoNode
} from './utils/cern-root.utils';
import {build} from 'jsrootdi/geom';




export class DetectorGeometryFineTuning {
  public namePattern: string;
  public editRules: GeoNodeEditRule[];

  constructor(
    namePattern: string,
    editRules:GeoNodeEditRule[] = []
  )
  {
    this.namePattern = namePattern;
    this.editRules = editRules;
  }
}

@Injectable({
  providedIn: 'root'
})
export class GeometryService {

  /**
   * Simple to fill list of patterns of elements to drop
   * @typedef {Array.<string>} FullGeometryPruneList
   */
  removeDetectorsStartsWith: string[];

  detectorTopNodes=[];

  /// This inted to become users rule
  fineTuneRules: GeoNodeEditRule[] = [];
  totalRules: GeoNodeEditRule[] = [];

  subDetectors: DetectorGeometryFineTuning[] = [
    {
      namePattern: "*/EcalBarrelScFi*",
      editRules: [
        {pattern: "*/fiber_grid*", prune:PruneRuleActions.Remove, pruneSubLevel:0},
      ]
    },
    {
      namePattern: "*/EcalBarrelImaging*",
      editRules: [
        {pattern: "*/stav*", prune:PruneRuleActions.RemoveChildren, pruneSubLevel:0},
      ]
    },
    {
      namePattern: "*/DRICH*",
      editRules: [
        {pattern: "*/DRICH_cooling*", prune:PruneRuleActions.RemoveSiblings, pruneSubLevel:0},
      ]
    },
    {
      namePattern: "*/EcalEndcapN*",
      editRules: [
        {pattern: "*/crystal*", prune:PruneRuleActions.RemoveSiblings, pruneSubLevel:0},
      ]
    }
  ]


  constructor() {
    this.removeDetectorsStartsWith = [
      "Lumi",
      "Magnet",
      "B0",
      "B1",
      "B2",
      "Q0",
      "Q1",
      "Q2",
      "BeamPipe",
      "Pipe",
      "ForwardOffM",
      "Forward",
      "Backward",
      "Vacuum",
      "SweeperMag*",
      "AnalyzerMag*",
      "ZDC",
      "LFHCAL"
    ];

    this.fineTuneRules = [
        {pattern: "Default/EcalBarrel*/sector*", prune: PruneRuleActions.RemoveChildren, pruneSubLevel: 0}
    ]

    // Fill rules with prune
    for(let pattern of this.removeDetectorsStartsWith) {
      this.totalRules.push(new GeoNodeEditRule(pattern, PruneRuleActions.Remove ));
    }

    // Copy users rules
    for(let rule of this.fineTuneRules) {
      this.totalRules.push(rule);
    }


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
    const rootGeoManager = await findGeoManager(file) // await file.readObject(objectName);
    // >oO console.log(geoManager);
    console.timeEnd('Reading geometry from file');

    // Getting main detector nodes

    const nodeName = rootGeoManager.fName;
    const volume = rootGeoManager.fMasterVolume === undefined ? rootGeoManager.fVolume : rootGeoManager.fMasterVolume;
    const allTopNodes = volume?.fNodes?.arr ?? null;
    if(!allTopNodes) {
      console.log("No top level detector nodes found. Wrong geometry? ")
      return {rootGeoManager: null, rootObject3d: null};
    }

    for(let topNode of allTopNodes) {
      let isRemoving = this.removeDetectorsStartsWith.some(substr => topNode.fName.startsWith(substr))
      console.log(`${topNode.fName}: ${topNode} isRemoving: ${isRemoving}`);
      removeGeoNode(topNode);
    }

    // >oO debug: analyzeGeoNodes(rootGeoManager, 1);
    console.time('Prune nodes coarse');
    editGeoNodes(rootGeoManager, this.totalRules, 1)
    console.timeEnd('Prune nodes coarse');

    // >oO


    for(let detector of this.subDetectors) {
      let topDetNode = findSingleGeoNode(rootGeoManager, detector.namePattern, 1);
      console.log(`Processing ${topDetNode}`);
      if(!topDetNode) {
        continue;
      }
      console.time(`Process sub-detector: ${detector.namePattern}`);
      for(let rule of detector.editRules) {

        editGeoNodes(topDetNode, [rule])
      }
      console.timeEnd(`Process sub-detector: ${detector.namePattern}`);
    }

    console.log(`Done processing ${this.subDetectors.length} detectors`);

    analyzeGeoNodes(rootGeoManager, 1);

    //analyzeGeoNodes(geoManager, 1);

    //
    console.time('Build geometry');
    let rootObject3d = build(rootGeoManager, { numfaces: 500000000, numnodes: 50000000, dflt_colors: false, vislevel: 100, doubleside:true, transparency:false});
    console.timeEnd('Build geometry');
    // >oO console.log(geo);

    return {rootGeoManager, rootObject3d};
  }
}

