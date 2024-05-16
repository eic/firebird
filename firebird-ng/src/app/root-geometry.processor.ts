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

export class RootGeometryProcessor {
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
        {pattern: "*/fiber_grid*", prune: PruneRuleActions.Remove},
      ]
    },
    {
      namePattern: "*/EcalBarrelImaging*",
      editRules: [
        {pattern: "*/stav*", prune: PruneRuleActions.RemoveChildren},
      ]
    },
    {
      namePattern: "*/DRICH*",
      editRules: [
        {pattern: "*/DRICH_cooling*", prune: PruneRuleActions.RemoveSiblings},
      ]
    },
    {
      namePattern: "*/EcalEndcapN*",
      editRules: [
        {pattern: "*/crystal*", prune: PruneRuleActions.RemoveSiblings},
      ]
    },
    {
      namePattern: "*/HcalEndcapPInsert_23*",
      editRules: [
        {pattern: "*/*layer*slice1_*", prune: PruneRuleActions.RemoveSiblings},
      ]
    },
    {
      namePattern: "*/HcalBarrel*",
      editRules: [
        {pattern: "*/Tile*", prune: PruneRuleActions.Remove},
        {pattern: "*/ChimneyTile*", prune: PruneRuleActions.Remove},
      ]
    },
    {
      namePattern: "*/EndcapTOF*",
      editRules: [
        {pattern: "*/suppbar*", prune: PruneRuleActions.Remove},
        {pattern: "*/component*3", prune: PruneRuleActions.RemoveSiblings},
      ]
    }
  ]

  public process(rootGeoManager:any):any {
    // Getting main detector nodes
    let result = pruneTopLevelDetectors(rootGeoManager, this.removeDetectorNames);
    console.log("Filtered top level detectors: ", result);


    // >oO analyzeGeoNodes(rootGeoManager, 1);
    // Now we go with the fine-tuning of each detector
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
  }
}
