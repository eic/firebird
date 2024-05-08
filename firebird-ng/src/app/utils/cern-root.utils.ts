/// Prints geometry structure

import { wildCardCheck } from './wildcard';

export type GeoNodeWalkCallback = (node: any, nodeFullPath: string, level: number) => void;

export enum PruneRuleActions {
  Nothing,          /// Do not remove this or other nodes
  Remove,           /// Removes this node
  RemoveSiblings,   /// Remove all sibling nodes and leave only this node
  RemoveDaughters,  /// Remove all doughter nodes
}

export class GeoNodeEditRule {
  pattern = '';
  prune = PruneRuleActions.Nothing;

}

export function walkGeoNodes(node: any, callback: GeoNodeWalkCallback|null, maxLevel = 0, level = 0, path = "", pattern?: string) {
  const nodeName = node.fName;
  const volume = node.fMasterVolume === undefined ? node.fVolume : node.fMasterVolume;
  const subNodes = volume ? volume.fNodes : null;
  const nodeFullPath = path ? `${path}/${nodeName}` : nodeName;
  let processedNodes = 1;

  // Only invoke the callback if no pattern is provided or if the pattern matches the fullPath
  if (!pattern || wildCardCheck(nodeFullPath, pattern)) {
    if(callback){
      callback(node, nodeFullPath, level);
    }
  }

  // Continue recursion to child nodes if they exist and the max level is not reached
  if (volume && subNodes && level < maxLevel) {
    for (let i = 0; i < subNodes.arr.length; i++) {
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
  };

  // Use walkGeoNodes with the collecting callback and the pattern
  walkGeoNodes(node, collectNodes, maxLevel, 0, "", pattern);

  return matchingNodes;
}

export function editGeoNodes(topNode: any, rules: GeoNodeEditRule[], maxLevel:number=Infinity): any[] {
  let matches: {node: any, fullPath: string, rule: GeoNodeEditRule}[] = [];

  let tmpRules = [...rules];

  // Define a callback using the GeoNodeWalkCallback type
  const collectNodes: GeoNodeWalkCallback = (node, nodeFullPath, level) => {
    for(const rule of tmpRules) {

      // Does the node fulfill the rule?
      if(wildCardCheck(nodeFullPath, rule.pattern)) {
        // Add a node to matches
        matches.push({ node: node, fullPath: nodeFullPath, rule: rule });

        // remove rule from the list if it worked
        // tmpRules = tmpRules.filter(arrayRule => arrayRule !== rule);
      }
    }
  };

  // Use walkGeoNodes with the collecting callback and the pattern
  walkGeoNodes(topNode, collectNodes, maxLevel);

  for(let item of matches) {
    let node = item.node;
    let fullPath = node.fullPath;
    let rule:GeoNodeEditRule = item.rule;
    let motherVolume = item.node.fMother
    let siblings = motherVolume?.fNodes?.arr

    if(rule.prune == PruneRuleActions.Remove) {

      if (siblings) {
        const index = siblings.indexOf(item.node);

        if (index !== -1) { // Check if the item was found
          siblings.splice(index, 1); // Remove the item
          console.log('Item removed:', fullPath);
        } else {
          console.log('Item not found in array.');
        }
      }
      else
      {
        console.log("Can't get an array");
      }
    }

    if(rule.prune == PruneRuleActions.RemoveSiblings) {
      if (siblings) {
        motherVolume.fNodes.arr = [node]
        console.log('Array modified to keep only:', fullPath);
      }
      else
      {
        console.log("Can't get an array");
      }
    }

    if(rule.prune == PruneRuleActions.RemoveDaughters) {

      let daughters = node.fVolume?.fNodes?.arr;

      if (daughters) {
        node.fVolume.fNodes.arr = []
        console.log('Removed all doughters from: ', item.fullPath);
      }
      else
      {
        console.log("Can't get daughters");
      }
    }
  }

  return matches;
}


export function analyzeGeoNodes(node: any, level:number=2) {
  let highLevelNodes: {geoNode: any, fullPath: string}[] = [];

  // First we collect main nodes
  const collectNodes: GeoNodeWalkCallback = (geoNode, nodeFullPath, level) => {
    // Add a node to a watch
    highLevelNodes.push({ geoNode, fullPath: nodeFullPath });
  };


  // Use walkGeoNodes with the collecting callback and the pattern
  walkGeoNodes(node, collectNodes, level);

  for(let item of highLevelNodes) {
    // Now run walkNodes for each of high level node to get number of subnodes
    let numSubNodes = walkGeoNodes(item.geoNode, null, Infinity);
    console.log(`${numSubNodes}: ${item.fullPath}`);
  }
}

export async function findGeoManager(file: any){
  for (const key of file.fKeys) {
    if(key.fClassName === "TGeoManager") {
      return file.readObject(key.fName);
    }
  }
  return null;
}
