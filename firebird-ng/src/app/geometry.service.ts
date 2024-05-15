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


export class DetectorGeometryFineTuning {
  namePattern: string = "";
  editRules: GeoNodeEditRule[] = [];
}


function pruneTopLevelDetectors(geoManager: any, removeNames: string[]): any {
  const volume = geoManager.fMasterVolume === undefined ? geoManager.fVolume : geoManager.fMasterVolume;
  const nodes: any[] = volume?.fNodes?.arr ?? [];
  let removedNodes: any[] = [];

  // Don't have nodes? Have problems?
  if(!nodes.length) {
    return {nodes, removedNodes};
  }

  // Collect nodes to remove
  for(let node of nodes) {
    let isRemoving = removeNames.some(substr => node.fName.startsWith(substr))
    if(isRemoving) {
      removedNodes.push(node);
    }
  }

  // Now remove nodes
  for(let node of removedNodes) {
    removeGeoNode(node);
  }

  return {nodes, removedNodes}
}



@Injectable({
  providedIn: 'root'
})
export class GeometryService {

  /**
   * Detectors (top level TGeo nodes) to be removed.
   * (!) startsWith function is used for filtering (aka: detector.fName.startsWith(removeDetectorNames[i]) ... )
   */
  removeDetectorNames: string[] = [
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
    "SweeperMag",
    "AnalyzerMag",
    "ZDC",
    "LFHCAL",
    "HcalFarForward"
  ];

  subDetectorsRules: DetectorGeometryFineTuning[] = [
    {
      namePattern: "*/EcalBarrelScFi*",
      editRules: [
        {pattern: "*/fiber_grid*", prune:PruneRuleActions.Remove},
      ]
    },
    {
      namePattern: "*/EcalBarrelImaging*",
      editRules: [
        {pattern: "*/stav*", prune:PruneRuleActions.RemoveChildren},
      ]
    },
    {
      namePattern: "*/DRICH*",
      editRules: [
        {pattern: "*/DRICH_cooling*", prune:PruneRuleActions.RemoveSiblings},
      ]
    },
    {
      namePattern: "*/EcalEndcapN*",
      editRules: [
        {pattern: "*/crystal*", prune:PruneRuleActions.RemoveSiblings},
      ]
    },
    {
      namePattern: "*/HcalBarrel*",
      editRules: [
        {pattern: "*/Tile*", prune:PruneRuleActions.Remove},
        {pattern: "*/ChimneyTile*", prune:PruneRuleActions.Remove},
      ]
    },
    {
      namePattern: "*/EndcapTOF*",
      editRules: [
        {pattern: "*/suppbar*", prune:PruneRuleActions.Remove},
        {pattern: "*/component*3", prune:PruneRuleActions.RemoveSiblings},
      ]
    }

  ]

  constructor() {
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
    let result = pruneTopLevelDetectors(rootGeoManager, this.removeDetectorNames);
    console.log("Filtered top level detectors: ", result);


    // >oO analyzeGeoNodes(rootGeoManager, 1);
    // Now we go with the fine tuning each detector
    for(let detector of this.subDetectorsRules) {
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

    console.log(`Done processing ${this.subDetectorsRules.length} detectors`);

    console.log(`---- DETECTOR ANALYSIS ----`);
    analyzeGeoNodes(rootGeoManager, 1);
    console.log(`---- END DETECTOR ANALYSIS ----`);

    //analyzeGeoNodes(geoManager, 1);
    // return {rootGeoManager: null, rootObject3d: null};

    //
    console.time('Build geometry');
    let rootObject3d = build(rootGeoManager, { numfaces: 500000000, numnodes: 50000000, instancing:1, dflt_colors: false, vislevel: 100, doubleside:false, transparency:true});
    console.timeEnd('Build geometry');
    // >oO console.log(geo);

    return {rootGeoManager, rootObject3d};
  }
}

