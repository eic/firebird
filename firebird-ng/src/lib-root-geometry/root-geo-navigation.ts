/**
 * @date Created on July 10, 2024
 * @author Dmitry Romanov
 *
 * @license This file is part of Firebird display, which is released under a license agreement
 * available in the LICENSE file located in the root directory of this project source tree. This
 * file is subject to that license and is intended to be used in accordance with it.
 *
 * @summary This module provides utility functions for navigating and manipulating TGeo nodes within the CERN ROOT framework.
 * It includes functionalities to walk through geometric nodes with customizable callbacks, find nodes matching specific patterns,
 * and analyze nodes based on provided criteria.
 * Key functions include `walkGeoNodes`, `findGeoNodes`, `analyzeGeoNodes`.
 */

import { wildCardCheck } from '../app/utils/wildcard';


export type GeoNodeWalkCallback = (node: any, nodeFullPath: string, level: number) => boolean;

export function walkGeoNodes(node: any, callback: GeoNodeWalkCallback|null, maxLevel = 0, level = 0, path = "", pattern?: string) {
  const nodeName = node.fName;
  const volume = node.fMasterVolume === undefined ? node.fVolume : node.fMasterVolume;
  const subNodes = volume ? volume.fNodes : null;
  const nodeFullPath = path ? `${path}/${nodeName}` : nodeName;
  let processedNodes = 1;

  // Only invoke the callback if no pattern is provided or if the pattern matches the fullPath
  let processChildren = true;
  if (!pattern || wildCardCheck(nodeFullPath, pattern)) {
    if(callback){
      processChildren = callback(node, nodeFullPath, level);
      if(!processChildren) {
        return processedNodes;
      }
    }
  }

  // Continue recursion to child nodes if they exist and the max level is not reached
  if (volume && subNodes && level < maxLevel) {
    for (let i = subNodes.arr.length - 1; i >= 0; i--) {
      const childNode = subNodes.arr[i];
      if (childNode) {
        processedNodes += walkGeoNodes(childNode, callback, maxLevel, level + 1, nodeFullPath, pattern);
      }
    }
  }

  return processedNodes;
}

export function findGeoNodes(node: any, pattern: string, maxLevel:number=Infinity): any[] {
  let matchingNodes: {geoNode: any, fullPath: string}[] = [];

  // Define a callback using the GeoNodeWalkCallback type
  const collectNodes: GeoNodeWalkCallback = (geoNode, nodeFullPath, level) => {
    matchingNodes.push({ geoNode, fullPath: nodeFullPath });
    return true; // go through children
  };

  // Use walkGeoNodes with the collecting callback and the pattern
  walkGeoNodes(node, collectNodes, maxLevel, 0, "", pattern);

  return matchingNodes;
}

export function findSingleGeoNode(topNode: any, pattern:string, maxLevel:number=Infinity): any|null {
  let result = findGeoNodes(topNode, pattern, maxLevel);
  if(result === null || result === undefined) {
    return null;
  }
  if(result.length > 1) {
    throw new Error(`findSingleGeoNode of ${topNode} returned more than 1 result (${result.length})`);
  }
  if(result.length == 0) {
    return null;
  }
  return result[0].geoNode;
}


export function analyzeGeoNodes(node: any, level:number=2) {

  let highLevelNodes = getGeoNodesByLevel(node, 1);

  let totalNodes = 0;

  console.log(`  --- Detector subcomponents [num]-[name]: ${highLevelNodes.length}`);
  for(let item of highLevelNodes) {
    // Now run walkNodes for each of high level node to get number of subnodes
    let numSubNodes = walkGeoNodes(item.geoNode, null, Infinity);
    totalNodes += numSubNodes;
    console.log(`    ${numSubNodes}: ${item.fullPath}`);
  }
  console.log(`  --- End of analysis --- Total elements: ${totalNodes}`);

}

export function getGeoNodesByLevel(topNode: any, selectLevel:number=1) {
  let selectedNodes: {geoNode: any, fullPath: string}[] = [];

  // First we collect main nodes
  const collectNodes: GeoNodeWalkCallback = (node, fullPath, nodeLevel) => {
    // Add a node to a watch
    if(nodeLevel == selectLevel) {
      selectedNodes.push({ geoNode: node, fullPath: fullPath });
      return false; // don't go deeper, we need this level
    }
    return true;
  };

  // Use walkGeoNodes with the collecting callback and the pattern
  walkGeoNodes(topNode, collectNodes, selectLevel);

  return selectedNodes;
}

export async function findGeoManager(file: any){
  for (const key of file.fKeys) {
    if(key.fClassName === "TGeoManager") {
      return file.readObject(key.fName);
    }
  }
  return null;
}
