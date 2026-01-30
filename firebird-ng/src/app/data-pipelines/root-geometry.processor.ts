//import { openFile } from '../../../jsroot/core.mjs';
//import * as ROOT from '../../../jsroot/build;
import {
  analyzeGeoNodes,
  findSingleGeoNode,
} from '../../lib-root-geometry/root-geo-navigation';
import {EditActions, GeoNodeEditRule, removeGeoNode} from "../../lib-root-geometry/root-geo-edit";
import {GeoAttBits} from "../../lib-root-geometry/root-geo-attribute-bits";
import {editGeoNodes} from "../../lib-root-geometry/root-geo-edit";


export class DetectorGeometryFineTuning {
  namePattern: string = "";
  editRules: GeoNodeEditRule[] = [];
}


export function pruneTopLevelDetectors(geoManager: any, removeNames: string[]): any {
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


  subDetectorsRules: DetectorGeometryFineTuning[] = [
    {
      namePattern: "*/EcalBarrelScFi*",
      editRules: [
        {pattern: "*/fiber_grid*", action: EditActions.Remove},
        {pattern: "*", action: EditActions.SetGeoBit, geoBit: GeoAttBits.kVisDaughters},
        {pattern: "*/*layer*", action: EditActions.SetGeoBit, geoBit: GeoAttBits.kVisThis},
        {pattern: "*/*layer*", action: EditActions.UnsetGeoBit, geoBit: GeoAttBits.kVisNone},
        {pattern: "*/*layer*", action: EditActions.UnsetGeoBit, geoBit: GeoAttBits.kVisDaughters},
      ]
    },
    {
      namePattern: "*/EcalBarrelTracker*",
      editRules: [
        {pattern: "*", action: EditActions.SetGeoBit, geoBit: GeoAttBits.kVisDaughters},
        {pattern: "*/stave*", action: EditActions.RemoveChildren},
        {pattern: "*/stave*", action: EditActions.SetGeoBit, geoBit: GeoAttBits.kVisThis},
        {pattern: "*/stave*", action: EditActions.UnsetGeoBit, geoBit: GeoAttBits.kVisNone},
        {pattern: "*/stave*", action: EditActions.UnsetGeoBit, geoBit: GeoAttBits.kVisDaughters},
      ]
    },
    {
      namePattern: "*/EcalBarrelImaging*",
      editRules: [
        {pattern: "*/stav*", action: EditActions.RemoveChildren},
        {pattern: "*", action: EditActions.SetGeoBit, geoBit: GeoAttBits.kVisDaughters},
      ]
    },
    {
      namePattern: "*/DRICH*",
      editRules: [
        {pattern: "*/DRICH_cooling*", action: EditActions.RemoveSiblings},
      ]
    },
    {
      namePattern: "*/DIRC*",
      editRules: [
        {pattern: "*/Envelope_box*", action: EditActions.RemoveChildren},
        {pattern: "*/Envelope_box*", action: EditActions.SetGeoBit, geoBit: GeoAttBits.kVisThis},
        {pattern: "*/Envelope_box*", action: EditActions.UnsetGeoBit, geoBit: GeoAttBits.kVisNone},
        {pattern: "*/Envelope_box*", action: EditActions.UnsetGeoBit, geoBit: GeoAttBits.kVisDaughters},
        {pattern: "*/Envelope_lens_vol*", action: EditActions.Remove},
      ]
    },
    {
      namePattern: "*/EcalEndcapN*",
      editRules: [
        {pattern: "*/crystal*", action: EditActions.RemoveSiblings},
      ]
    },
    {
      namePattern: "*/EcalEndcapP_*",
      editRules: [
        {pattern: "*/EcalEndcapP_layer1_0*", action: EditActions.UnsetGeoBit, geoBit: GeoAttBits.kVisDaughters},
        {pattern: "*/EcalEndcapP_layer1_0*", action: EditActions.RemoveChildren},
      ]
    },
    {
      namePattern: "*/LFHCAL_*",
      editRules: [
        {pattern: "*/LFHCAL_8M*", action: EditActions.RemoveChildren},
        {pattern: "*/LFHCAL_8M*", action: EditActions.SetGeoBit, geoBit: GeoAttBits.kVisThis},
        {pattern: "*/LFHCAL_8M*", action: EditActions.UnsetGeoBit, geoBit: GeoAttBits.kVisNone},
        {pattern: "*/LFHCAL_8M*", action: EditActions.UnsetGeoBit, geoBit: GeoAttBits.kVisDaughters},
        {pattern: "*/LFHCAL_4M*", action: EditActions.RemoveChildren},
        {pattern: "*/LFHCAL_4M*", action: EditActions.SetGeoBit, geoBit: GeoAttBits.kVisThis},
        {pattern: "*/LFHCAL_4M*", action: EditActions.UnsetGeoBit, geoBit: GeoAttBits.kVisNone},
        {pattern: "*/LFHCAL_4M*", action: EditActions.UnsetGeoBit, geoBit: GeoAttBits.kVisDaughters},
      ]
    },
    {
      namePattern: "*/HcalEndcapPInsert_23*",
      editRules: [
        {pattern: "*/*layer*slice1_*", action: EditActions.RemoveSiblings},
      ]
    },
    {
      namePattern: "*/HcalBarrel*",
      editRules: [
        {pattern: "*/Tile*", action: EditActions.Remove},
        {pattern: "*/ChimneyTile*", action: EditActions.Remove},
      ]
    },
    {
      namePattern: "*/EndcapTOF*",
      editRules: [
        {pattern: "*/suppbar*", action: EditActions.Remove},
        {pattern: "*/component_hyb*", action: EditActions.Remove},
      ]
    },
    {
      namePattern: "*/VertexBarrelSubAssembly*",
      editRules: [
        {pattern: "*/biasing*", action: EditActions.Remove},
        {pattern: "*/readout*", action: EditActions.Remove},
        {pattern: "*/backbone*", action: EditActions.Remove},
      ]

    },
    {
      namePattern: "*/BarrelTOF*",
      editRules: [
        {pattern: "*/component_sensor*", action: EditActions.Remove},
        {pattern: "*/component_ASIC*", action: EditActions.Remove},
        {pattern: "*/cooling*", action: EditActions.Remove},
      ]
    },

  ]

  public process(rootGeoManager:any):any {

    // console.log("[RootGeometryProcessor] Filtered top level detectors: ", result);
    console.time(`[RootGeometryProcessor] Processing time`);

    // >oO
    // analyzeGeoNodes(rootGeoManager, 1);
    // Now we go with the fine-tuning of each detector
    for(let detector of this.subDetectorsRules) {
      let topDetNode = findSingleGeoNode(rootGeoManager, detector.namePattern, 1);
      // console.log(`Processing ${topDetNode}`);
      if(!topDetNode) {
        continue;
      }
      // console.time(`[RootGeometryProcessor] Process sub-detector: ${detector.namePattern}`);
      for(let rule of detector.editRules) {

        editGeoNodes(topDetNode, [rule])
      }
      // console.timeEnd(`[RootGeometryProcessor] Process sub-detector: ${detector.namePattern}`);
    }

    console.timeEnd(`[RootGeometryProcessor] Processing time`);
    console.log(`[RootGeometryProcessor] Done processing ${this.subDetectorsRules.length} detectors`);
  }
}
