/**
 * Pre-build edits of a ROOT TGeo tree, run in the geometry worker before
 * jsroot builds three.js objects. What to remove and edit arrives as data
 * with each load request (`withRootGeometryRules()`); this module only knows
 * how to apply it.
 */

import { editGeoNodes, findGeoNodes, removeGeoNode } from '@dexvis/root-geo-tree-editor';
import type { DetectorEditRules } from '@dexvis/firebird-ng/api';

/** Removes the top-level detectors whose names start with one of `removeNames`. */
export function pruneTopLevelDetectors(geoManager: any, removeNames: readonly string[]): { nodes: any[]; removedNodes: any[] } {
  const volume = geoManager.fMasterVolume === undefined ? geoManager.fVolume : geoManager.fMasterVolume;
  const nodes: any[] = volume?.fNodes?.arr ?? [];
  const removedNodes = nodes.filter(node => removeNames.some(prefix => node.fName.startsWith(prefix)));
  for (const node of removedNodes) {
    removeGeoNode(node);
  }
  return { nodes, removedNodes };
}

/**
 * Applies detector edit rules to the top-level nodes of a TGeo tree. A
 * pattern may match several detectors (two copies of one detector, or
 * 'Tracker*' matching Tracker and TrackerSupport): each match gets the rules.
 * A pattern that matches nothing is skipped, so one rule set serves several
 * geometry versions.
 */
export function applyDetectorEditRules(geoManager: any, detectors: readonly DetectorEditRules[]): void {
  console.time('[RootGeometryProcessor] Processing time');
  for (const detector of detectors) {
    for (const { geoNode } of findGeoNodes(geoManager, detector.namePattern, 1)) {
      // One rule per pass: a rule sees the tree the previous rules left
      for (const rule of detector.editRules) {
        editGeoNodes(geoNode, [rule]);
      }
    }
  }
  console.timeEnd('[RootGeometryProcessor] Processing time');
  console.log(`[RootGeometryProcessor] Done processing ${detectors.length} detectors`);
}
